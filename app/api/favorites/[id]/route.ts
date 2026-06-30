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
  const fav = await prisma.favorite.findUnique({ where: { id } });
  if (!fav || fav.userId !== user.id) return notFound();

  await prisma.favorite.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
