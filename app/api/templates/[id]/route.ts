import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized, notFound } from "@/lib/http";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const tpl = await prisma.mealTemplate.findUnique({ where: { id } });
  if (!tpl || tpl.userId !== user.id) return notFound();

  await prisma.mealTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
