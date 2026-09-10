"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

/*
 * Cross-browser barcode scanner:
 * - Uses native `BarcodeDetector` when present (Chrome, Android, Edge).
 * - Polyfills with WASM ZXing (`barcode-detector/pure`) for iOS Safari, macOS Safari, and Firefox.
 * - Supports live camera video streaming with autofocus environment rear camera.
 * - Supports photo capture & file upload (<input type="file" capture="environment">).
 * - Provides manual digit entry fallback so the user is never blocked.
 */

type DetectedBarcode = { rawValue?: string };
type DetectorInstance = {
  detect(source: CanvasImageSource | ImageBitmap): Promise<DetectedBarcode[]>;
};

// The retail formats a food package actually carries.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"] as const;

let cachedDetector: DetectorInstance | null = null;

async function getBarcodeDetector(): Promise<DetectorInstance> {
  if (cachedDetector) return cachedDetector;

  const g =
    typeof window !== "undefined"
      ? (window as unknown as {
          BarcodeDetector?: new (opts?: { formats?: readonly string[] | string[] }) => DetectorInstance;
        })
      : null;

  if (g?.BarcodeDetector) {
    try {
      cachedDetector = new g.BarcodeDetector({ formats: [...FORMATS] });
      return cachedDetector;
    } catch {
      // Fallback to pure polyfill if native constructor rejects formats
    }
  }

  const { BarcodeDetector: PolyfillDetector } = await import("barcode-detector/pure");
  cachedDetector = new PolyfillDetector({ formats: [...FORMATS] }) as unknown as DetectorInstance;
  return cachedDetector;
}

export function isBarcodeScanningSupported(): boolean {
  return typeof window !== "undefined";
}

export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");

  onCloseRef.current = onClose;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Modal accessibility: trap focus, support Escape, restore focus upon close.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = priorOverflow;
      previous?.focus();
    };
  }, []);

  // Camera lifecycle effect
  useEffect(() => {
    let cancelled = false;
    let raf = 0;

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Live camera stream is unavailable. You can take a photo or enter the barcode digits below.",
        );
        return;
      }

      try {
        const detector = await getBarcodeDetector();
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        if (cancelled) return;
        setScanning(true);

        let lastCheck = 0;
        const tick = async (timestamp: number) => {
          if (cancelled || !videoRef.current) return;

          // Throttle checks to ~8-10 checks/sec to conserve battery and CPU
          if (timestamp - lastCheck > 120) {
            lastCheck = timestamp;
            try {
              const found = await detector.detect(videoRef.current);
              const code = found
                .find((c) => c.rawValue && c.rawValue.trim().length >= 6)
                ?.rawValue?.trim();

              if (code) {
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  navigator.vibrate(100);
                }
                stop();
                onDetected(code);
                return;
              }
            } catch {
              // Frame decode misses are normal
            }
          }

          raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string } | null)?.name;
        setCameraError(
          name === "NotAllowedError"
            ? "Camera permission was denied. You can take a photo or enter the digits below."
            : name === "NotFoundError"
              ? "No camera found on this device. You can enter the digits below."
              : "Could not start live camera feed. You can take a photo or enter digits below.",
        );
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stop();
    };
  }, [onDetected, stop]);

  // Photo capture / file selection handler
  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setFeedbackNotice(null);
    setAnalyzingPhoto(true);

    try {
      const detector = await getBarcodeDetector();
      const url = URL.createObjectURL(file);
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Could not load selected photo"));
        img.src = url;
      });

      let source: CanvasImageSource = img;
      const maxDim = Math.max(img.naturalWidth, img.naturalHeight);
      if (maxDim > 2048) {
        const scale = 2048 / maxDim;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          source = canvas;
        }
      }

      const found = await detector.detect(source);
      URL.revokeObjectURL(url);

      const code = found
        .find((c) => c.rawValue && c.rawValue.trim().length >= 6)
        ?.rawValue?.trim();

      if (code) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(100);
        }
        stop();
        onDetected(code);
      } else {
        setFeedbackNotice(
          "No barcode detected in that photo. Make sure the barcode is well-lit, centered, and sharp.",
        );
      }
    } catch (err) {
      setFeedbackNotice(err instanceof Error ? err.message : "Failed to analyze photo");
    } finally {
      setAnalyzingPhoto(false);
    }
  }

  // Manual digit submit handler
  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = manualCode.trim();
    if (!/^\d{6,14}$/.test(cleaned)) {
      setFeedbackNotice("Please enter 6 to 14 numeric digits (e.g. 5449000000996).");
      return;
    }
    stop();
    onDetected(cleaned);
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "color-mix(in srgb, var(--bg) 94%, transparent)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Scan a barcode"
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
          Scan a barcode
        </span>
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="glyph-btn text-ink-faint hover:text-ink"
          aria-label="Close scanner"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center p-3 overflow-y-auto">
        <div className="w-full max-w-sm space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoFile}
          />

          {!cameraError ? (
            <div>
              <div
                className="relative overflow-hidden rounded border"
                style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
              >
                <video ref={videoRef} muted playsInline autoPlay className="block w-full" />
                <div
                  className="pointer-events-none absolute inset-x-6 top-1/2"
                  style={{ height: 1, background: "var(--accent)" }}
                  aria-hidden="true"
                />
              </div>
              <p className="mt-2 text-center text-2xs text-ink-faint">
                {scanning ? "Hold the barcode across the line" : "Starting camera preview…"}
              </p>
            </div>
          ) : (
            <div className="panel p-3 text-center">
              <p className="text-xs text-ink-dim">{cameraError}</p>
            </div>
          )}

          <div className="panel p-2.5 space-y-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzingPhoto}
              className="btn btn-ghost w-full flex items-center justify-center gap-1.5 py-1.5 text-xs"
            >
              {analyzingPhoto ? (
                <>
                  <Loader2 size={14} className="animate-spin text-ink-dim" />
                  <span>Scanning photo…</span>
                </>
              ) : (
                <>
                  <Camera size={14} className="text-ink-dim" />
                  <span>Snap photo or select picture</span>
                </>
              )}
            </button>

            <form onSubmit={handleManualSubmit} className="flex gap-1.5 pt-1 border-t" style={{ borderColor: "var(--line)" }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Or enter barcode digits…"
                aria-label="Barcode digits"
                className="field flex-1 text-xs"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="btn btn-primary px-3 text-xs"
              >
                Find
              </button>
            </form>

            {feedbackNotice && (
              <p className="text-2xs text-accent text-center pt-1 font-medium">
                {feedbackNotice}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
