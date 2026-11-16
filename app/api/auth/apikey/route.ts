import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized } from "@/lib/http";
import { generateApiKey } from "@/lib/api-key";

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
  const apiKey = generateApiKey();
  await prisma.user.update({ where: { id: user.id }, data: { apiKey } });
  return NextResponse.json({ apiKey });
}
