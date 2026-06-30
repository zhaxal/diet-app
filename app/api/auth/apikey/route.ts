import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized } from "@/lib/http";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  const { apiKey } = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { apiKey: true },
  });
  return NextResponse.json({ apiKey });
}

// Regenerate — old key is immediately invalidated.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  const apiKey = randomBytes(16).toString("hex");
  await prisma.user.update({ where: { id: user.id }, data: { apiKey } });
  return NextResponse.json({ apiKey });
}
