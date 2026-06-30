import { NextRequest, NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/openapi";

// Serve the OpenAPI spec. The server URL is derived from the incoming request
// so the spec works regardless of host/port.
export function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  return NextResponse.json(buildOpenApiDocument(origin));
}
