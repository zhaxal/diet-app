"use client";

import { useEffect } from "react";

/**
 * Registers the shell-caching worker so the installed PWA opens without a
 * network. Production only: in development the worker would sit in front of
 * hot-module reloads and serve yesterday's chunks.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | undefined;

    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        reg = r;
        // A worker that installed while the app was open should take over now
        // rather than waiting for every tab to close — the shell it replaces is
        // only ever consulted offline, so the swap is invisible.
        if (r.waiting) r.waiting.postMessage("SKIP_WAITING");
      })
      .catch(() => {
        // An unregistrable worker costs the app nothing but offline launch.
      });

    // Check for a new build when the app comes back from the background, which
    // for an installed PWA is the only moment it reliably "starts" again.
    function onWake() {
      if (document.visibilityState === "visible") reg?.update().catch(() => {});
    }
    document.addEventListener("visibilitychange", onWake);
    return () => document.removeEventListener("visibilitychange", onWake);
  }, []);

  return null;
}
