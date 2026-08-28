import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { updateProductSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized, notFound } from "@/lib/http";

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

  const product = await prisma.product.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ product });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const existing = await prisma.product.findFirst({ where: { id, userId: user.id } });
  if (!existing) return notFound();

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
