import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { updateProductSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized, notFound } from "@/lib/http";
import { normaliseServing, type Basis, type ServingUnit } from "@/lib/units";
import { ProductServiceError, validateServingForBasis } from "@/lib/services/products";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const existing = await prisma.product.findFirst({ where: { id, userId: user.id } });
  if (!existing) return notFound();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const {
    servingSize,
    servingUnit,
    servingGrams,
    barcode,
    brand,
    ...rest
  } = parsed.data;

  const targetBasis = (rest.basis ?? existing.basis) as Basis;
  const hasServingUpdate =
    servingSize !== undefined ||
    servingUnit !== undefined ||
    servingGrams !== undefined ||
    rest.basis !== undefined;

  let servingPatch: { servingSize?: number | null; servingUnit?: ServingUnit | null } = {};
  if (hasServingUpdate) {
    const resolved = normaliseServing(
      {
        servingSize: servingSize !== undefined ? servingSize : existing.servingSize,
        servingUnit:
          servingUnit !== undefined
            ? servingUnit
            : (existing.servingUnit as ServingUnit | null),
        servingGrams,
      },
      targetBasis,
    );
    try {
      validateServingForBasis(targetBasis, resolved.servingSize, resolved.servingUnit);
    } catch (err) {
      if (err instanceof ProductServiceError) return jsonError(err.message, err.status);
      throw err;
    }
    servingPatch = resolved;
  }

  const updateData: Prisma.ProductUpdateInput = {
    ...rest,
    ...(brand !== undefined ? { brand: brand?.trim() || null } : {}),
    ...(barcode !== undefined ? { barcode: barcode?.trim() || null } : {}),
    ...servingPatch,
  };

  try {
    const product = await prisma.product.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json({ product });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return jsonError("A product with that barcode already exists", 409);
      }
      if (err.code === "P2025") return notFound();
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const { count } = await prisma.product.deleteMany({
    where: { id, userId: user.id },
  });
  if (count === 0) return notFound();

  return NextResponse.json({ ok: true });
}
