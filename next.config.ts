import type { NextConfig } from "next";

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
