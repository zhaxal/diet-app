import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { productSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";
import { normaliseServing } from "@/lib/units";

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

  const { brand, barcode, servingSize, servingUnit, servingGrams, ...rest } = parsed.data;
  const data = {
    ...rest,
    brand: brand ?? null,
    barcode: barcode ?? null,
    // A serving is an amount in a unit. `servingGrams` still works and is read
    // as the product's own base unit, which is what it always meant.
    ...normaliseServing({ servingSize, servingUnit, servingGrams }, rest.basis),
  };

  const existing = barcode
    ? await prisma.product.findFirst({ where: { userId: user.id, barcode } })
    : await prisma.product.findFirst({
        where: { userId: user.id, name: data.name, brand: data.brand },
      });

  const product = existing
    ? await prisma.product.update({ where: { id: existing.id }, data })
    : await prisma.product.create({ data: { ...data, userId: user.id } });

  return NextResponse.json({ product }, { status: existing ? 200 : 201 });
}
