/*
 * rationd service worker.
 *
 * Scope, deliberately narrow: this worker caches the application shell so the
 * installed PWA opens without a network. It does NOT cache anything under
 * /api/.
 *
 * That exclusion is the whole design. Two front doors write to this data — the
 * screen and the assistant — so a cached day served as if it were current would
 * be a lie the user cannot detect, and a Cache Storage entry keyed by URL would
 * outlive a logout and hand one account's food log to the next person on the
 * device. Offline reads are the app's job instead: it keeps a snapshot in
 * localStorage, scoped to a user id and stamped with the time it was taken, and
 * renders it labelled as a past reading. See lib/offline-cache.ts.
 */

const VERSION = "v4";
const SHELL = `diet-shell-${VERSION}`;
const ASSETS = `diet-assets-${VERSION}`;

// Routes worth having before the first offline launch. Everything else arrives
// through the cache-first asset rule as it is used.
const SHELL_ROUTES = ["/", "/login", "/register"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Individually, so one 404 cannot fail the whole install.
      await Promise.all(
        SHELL_ROUTES.map((route) =>
          cache.add(new Request(route, { cache: "reload" })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("diet-") && k !== SHELL && k !== ASSETS)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Hashed build output and the app icons: cache-first.
 *
 * The build output is content-hashed, so it is immutable by construction. The
 * icons are not — they keep their names when redrawn — so a new icon reaches an
 * installed app only when VERSION changes and `activate` drops the old caches.
 * That is why VERSION is bumped whenever the icons are regenerated.
 */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /^\/(icon|apple-touch-icon)[\w-]*\.(svg|png)$/.test(url.pathname)
  );
}

function canCacheAsset(url, response) {
  const isIcon = /^\/(icon|apple-touch-icon)[\w-]*\.(svg|png)$/.test(url.pathname);
  const cacheControl = response.headers.get("cache-control") || "";
  return response.ok && (isIcon || /\bimmutable\b/.test(cacheControl));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache authenticated data, the connector endpoint, or exports.
  if (url.pathname.startsWith("/api/")) return;

  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        // Turbopack development chunks use stable URLs and must never be
        // cache-first. Production output declares itself immutable instead.
        if (canCacheAsset(url, res)) (await caches.open(ASSETS)).put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // Keep the shell current whenever the network is there, so an offline
          // launch gets the last build the user actually ran, not the install-
          // time one.
          if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
          return res;
        } catch {
          return (
            (await caches.match(req)) ||
            (await caches.match("/")) ||
            new Response(
              "<!doctype html><meta charset=utf-8><title>Offline</title><body style='font:14px system-ui;padding:2rem'>Offline, and this page was never cached.",
              { status: 503, headers: { "Content-Type": "text/html" } },
            )
          );
        }
      })(),
    );
  }
});

// Lets the page ask a waiting worker to take over immediately after an update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
