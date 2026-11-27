import { NextRequest, NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/openapi";
import { resolvePublicOrigin } from "@/lib/origin";

// Serve the OpenAPI spec. The server URL honors validated proxy headers so
// Scalar /api-docs "Try it" requests work behind TLS-terminating proxies.
export function GET(req: NextRequest) {
  const origin = resolvePublicOrigin(req);
  return NextResponse.json(buildOpenApiDocument(origin));
}
