"use client";

import { useEffect, useState } from "react";
import { Share } from "lucide-react";

// Not in lib.dom.d.ts yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's pre-standard flag — still the only signal it gives.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Tells the user this app installs like a native one — offline shell, home
 * screen icon, no browser chrome — and gets them there. Android/desktop get
 * the real `beforeinstallprompt` button; iOS Safari never fires that event,
 * so it gets the manual Share-sheet steps instead.
 */
export default function InstallPwaCard() {
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIOS());

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div className="panel mb-2 flex items-center justify-between px-3 py-2">
        <span className="text-2xs uppercase tracking-wider text-ink-dim">App</span>
        <span className="text-2xs text-ink-faint">Installed, offline-ready ✓</span>
      </div>
    );
  }

  async function install() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      // Single-use, win or lose.
      setDeferredPrompt(null);
      setInstalling(false);
    }
  }

  return (
    <section className="panel mb-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
          Install App
        </h2>
        {deferredPrompt && (
          <button
            type="button"
            onClick={install}
            disabled={installing}
            className="btn btn-primary shrink-0"
          >
            {installing ? "Installing…" : "Install"}
          </button>
        )}
      </div>

      {deferredPrompt && (
        <p className="mt-1.5 text-2xs text-ink-faint">
          Adds a home screen icon that opens without browser chrome and loads offline.
        </p>
      )}

      {!deferredPrompt && ios && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1 text-2xs text-ink-faint">
          <span>In Safari, tap</span>
          <Share size={12} aria-hidden="true" className="inline-block text-ink-dim" />
          <span>Share, then</span>
          <strong className="text-ink-dim">Add to Home Screen</strong>
          <span>— it opens without browser chrome and loads offline.</span>
        </p>
      )}

      {!deferredPrompt && !ios && (
        <p className="mt-1.5 text-2xs text-ink-faint">
          Look for an install icon in your browser&apos;s address bar, or{" "}
          <strong className="text-ink-dim">Add to Home Screen</strong> in its menu — it opens
          without browser chrome and loads offline.
        </p>
      )}
    </section>
  );
}
