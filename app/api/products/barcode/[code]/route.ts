import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { lookupOrFetchBarcode } from "@/lib/services/products";

export const runtime = "nodejs";

/**
 * GET /api/products/barcode/:code
 *
 * The saved catalog first — the whole point of saving a label is never reading
 * it again — then Open Food Facts as a fallback. Returns `source` so the caller
 * can say where the numbers came from rather than presenting a stranger's data
 * as the user's own.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { code } = await params;
  if (!/^\d{6,14}$/.test(code)) return jsonError("Not a barcode", 400);

  const result = await lookupOrFetchBarcode(user.id, code);
  return NextResponse.json({
    source: result.source,
    product: result.product,
  });
}
