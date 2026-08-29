"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/*
 * Barcode capture using the browser's own `BarcodeDetector`.
 *
 * No library: the product constraint is that the app ships self-contained on one
 * small box, and every JS barcode decoder worth using is a multi-hundred-kilobyte
 * wasm blob. `BarcodeDetector` is native, free, and already on the device.
 *
 * The cost is honest and stated to the user rather than hidden: it is Chrome and
 * Android only. Safari — including every browser on iOS — does not implement it,
 * so `isSupported()` is false there and the caller offers typing the digits
 * instead. That is a real limitation of this approach, not an oversight.
 */

type DetectedBarcode = { rawValue: string };
type DetectorCtor = new (opts?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
};

// The retail formats a food package actually carries.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

function detectorCtor(): DetectorCtor | null {
  const g = globalThis as unknown as { BarcodeDetector?: DetectorCtor };
  return g.BarcodeDetector ?? null;
}

export function isBarcodeScanningSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    detectorCtor() !== null
  );
}

export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    const Ctor = detectorCtor();

    (async () => {
      if (!Ctor) {
        setError("This browser cannot scan barcodes. Type the digits instead.");
        return;
      }
      try {
        // The rear camera, which is the one pointed at the packet.
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
        setScanning(true);

        const detector = new Ctor({ formats: FORMATS });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            const code = found.find((c) => c.rawValue?.length >= 8)?.rawValue;
            if (code) {
              stop();
              onDetected(code);
              return;
            }
          } catch {
            // A single failed frame is normal — motion blur, bad angle. Keep going.
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const name = (e as { name?: string } | null)?.name;
        setError(
          name === "NotAllowedError"
            ? "Camera permission was refused. Type the digits instead."
            : name === "NotFoundError"
              ? "No camera on this device. Type the digits instead."
              : "Could not start the camera. Type the digits instead.",
        );
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stop();
    };
  }, [onDetected, stop]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "color-mix(in srgb, var(--bg) 92%, transparent)" }}
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
        <button onClick={onClose} className="glyph-btn text-ink-faint hover:text-ink" aria-label="Close scanner">
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center p-3">
        {error ? (
          <div className="panel w-full max-w-sm p-3 text-center">
            <p className="text-xs text-ink-dim">{error}</p>
            <button onClick={onClose} className="btn btn-primary mt-3 w-full">
              Close
            </button>
          </div>
        ) : (
          <div className="w-full max-w-sm">
            <div
              className="relative overflow-hidden rounded border"
              style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
            >
              <video ref={videoRef} muted playsInline className="block w-full" />
              {/* A single hairline across the read line. The system has no
                  decorative overlay vocabulary, and a frame of animated corners
                  would be one. */}
              <div
                className="pointer-events-none absolute inset-x-6 top-1/2"
                style={{ height: 1, background: "var(--accent)" }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-2 text-center text-2xs text-ink-faint">
              {scanning ? "Hold the barcode across the line" : "Starting the camera…"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
