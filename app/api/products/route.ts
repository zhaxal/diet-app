import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { productSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";
import { ProductServiceError, upsertProduct } from "@/lib/services/products";

// GET /api/products?q= — the user's saved product catalog (per 100 g/ml).
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const products = await prisma.product.findMany({
    where: {
      userId: user.id,
      ...(q ? { OR: [{ name: { contains: q } }, { brand: { contains: q } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ products });
}

// POST /api/products — create or update a product. Re-saving the same barcode
// (or the same name+brand) updates in place rather than duplicating.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = productSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const { product, created } = await upsertProduct(user.id, parsed.data, "manual");
    return NextResponse.json({ product }, { status: created ? 201 : 200 });
  } catch (err) {
    if (err instanceof ProductServiceError) {
      return jsonError(err.message, err.status);
    }
    throw err;
  }
}
