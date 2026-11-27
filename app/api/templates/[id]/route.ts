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
  const { count } = await prisma.mealTemplate.deleteMany({
    where: { id, userId: user.id },
  });
  if (count === 0) return notFound();

  return NextResponse.json({ ok: true });
}
