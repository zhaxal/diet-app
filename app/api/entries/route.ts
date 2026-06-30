import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { createEntrySchema, dateQuerySchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";
import { dayBoundsInTz } from "@/lib/time";

// GET /api/entries?date=YYYY-MM-DD — list the current user's entries,
// optionally filtered to a single calendar day. Newest first.
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const dateParam = req.nextUrl.searchParams.get("date");
  let where: { userId: string; consumedAt?: { gte: Date; lt: Date } } = {
    userId: user.id,
  };

  if (dateParam) {
    const parsed = dateQuerySchema.safeParse(dateParam);
    if (!parsed.success) return zodError(parsed.error);
    const { start, end } = dayBoundsInTz(parsed.data, user.timezone);
    where = { ...where, consumedAt: { gte: start, lt: end } };
  }

  const entries = await prisma.foodEntry.findMany({
    where,
    orderBy: { consumedAt: "desc" },
  });

  return NextResponse.json({ entries });
}

// POST /api/entries — create a new food entry for the current user.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = createEntrySchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { name, calories, protein, carbs, fat, mealType, consumedAt } =
    parsed.data;

  const entry = await prisma.foodEntry.create({
    data: {
      userId: user.id,
      name,
      calories,
      protein,
      carbs,
      fat,
      mealType,
      consumedAt: consumedAt ? new Date(consumedAt) : undefined,
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}
