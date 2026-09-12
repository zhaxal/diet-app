"use client";

import { useEffect } from "react";

const DEV_RESET_KEY = "diet-dev-worker-reset-v1";

async function removeInheritedDevelopmentWorker() {
  const scope = new URL("/", window.location.href).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const inherited = registrations.filter((registration) => registration.scope === scope);
  if (inherited.length === 0) return false;

  await Promise.all(inherited.map((registration) => registration.unregister()));
  await Promise.all(
    (await caches.keys())
      .filter((key) => key.startsWith("diet-"))
      .map((key) => caches.delete(key)),
  );
  return true;
}

/**
 * Registers the shell-caching worker so the installed PWA opens without a
 * network. In development, remove a worker inherited from a prior production
 * run: Turbopack uses stable asset names, so an old cache can otherwise serve
 * yesterday's CSS and silently disable responsive rules.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      let cancelled = false;
      void removeInheritedDevelopmentWorker()
        .then((removed) => {
          if (removed && !cancelled && sessionStorage.getItem(DEV_RESET_KEY) !== "1") {
            sessionStorage.setItem(DEV_RESET_KEY, "1");
            window.location.reload();
          }
        })
        .catch(() => {
          // Development remains usable if browser storage is unavailable.
        });
      return () => {
        cancelled = true;
      };
    }

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
