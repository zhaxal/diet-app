import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { weightSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");

  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const to = toParam ? new Date(toParam) : now;

  const logs = await prisma.weightLog.findMany({
    where: { userId: user.id, loggedAt: { gte: from, lte: to } },
    orderBy: { loggedAt: "asc" },
  });

  return NextResponse.json({ logs });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = weightSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const log = await prisma.weightLog.create({
    data: {
      userId: user.id,
      weight: parsed.data.weight,
      loggedAt: parsed.data.loggedAt ? new Date(parsed.data.loggedAt) : undefined,
    },
  });

  return NextResponse.json({ log }, { status: 201 });
}
