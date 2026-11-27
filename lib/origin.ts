import type { NextRequest } from "next/server";

const HOST_RE = /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/;

/**
 * Resolve the public origin for metadata (MCP icons, OpenAPI servers) behind
 * an optional TLS-terminating proxy without trusting arbitrary schemes or hosts.
 */
export function resolvePublicOrigin(req: NextRequest): string {
  const configured = process.env.PUBLIC_ORIGIN?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Ignore malformed PUBLIC_ORIGIN and fall back to validated request headers.
    }
  }

  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (
    (forwardedProto === "http" || forwardedProto === "https") &&
    forwardedHost &&
    HOST_RE.test(forwardedHost)
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return req.nextUrl.origin;
}
