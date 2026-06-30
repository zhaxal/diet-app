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
  const log = await prisma.weightLog.findUnique({ where: { id } });
  if (!log || log.userId !== user.id) return notFound();

  await prisma.weightLog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
