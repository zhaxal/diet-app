import type { NextConfig } from "next";

// Sent on every response. Each one closes a door the app never uses:
//  - nosniff: a response is only ever what its Content-Type says it is.
//  - frame rules: the app is never embedded, so it cannot be click-jacked.
//  - Referrer-Policy: nothing about a visited URL leaves this origin.
//  - Permissions-Policy: the camera (barcode scanning) and nothing else.
//  - HSTS: production already requires HTTPS, because the session cookie is
//    `secure`. Browsers ignore this header over plain HTTP, so local use is
//    unaffected.
// There is deliberately no script-src policy: the theme is applied by an
// inline script before first paint, and the API reference ships its own bundle.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api-docs/scalar.js": [
      "./node_modules/@scalar/api-reference/dist/browser/standalone.js",
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // A cached service worker cannot ship its own replacement. Browsers
        // bypass the HTTP cache for the worker script on update checks, but
        // only for the script itself — being explicit costs nothing and makes
        // the intent legible behind a proxy that is less careful.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
