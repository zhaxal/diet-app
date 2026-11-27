"use client";

import { useState, useSyncExternalStore } from "react";
import { Share } from "lucide-react";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  getIsInstalled,
  getIsIOS,
  subscribePwaInstall,
} from "@/lib/pwa-install";

/**
 * Tells the user this app installs like a native one — offline shell, home
 * screen icon, no browser chrome — and gets them there. Android/desktop get
 * the real `beforeinstallprompt` button; iOS Safari never fires that event,
 * so it gets the manual Share-sheet steps instead.
 */
export default function InstallPwaCard() {
  const installed = useSyncExternalStore(subscribePwaInstall, getIsInstalled, () => false);
  const ios = useSyncExternalStore(subscribePwaInstall, getIsIOS, () => false);
  const deferredPrompt = useSyncExternalStore(
    subscribePwaInstall,
    getDeferredInstallPrompt,
    () => null,
  );
  const [installing, setInstalling] = useState(false);

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
      clearDeferredInstallPrompt();
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
