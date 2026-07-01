import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { copyDaySchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";
import { dayBoundsInTz, zonedWallToUtc } from "@/lib/time";

// POST /api/entries/copy { from, to } — duplicate all of `from`'s entries to `to`.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = copyDaySchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { from, to } = parsed.data;
  const { start, end } = dayBoundsInTz(from, user.timezone);
  const source = await prisma.foodEntry.findMany({
    where: { userId: user.id, consumedAt: { gte: start, lt: end } },
  });

  if (source.length === 0) {
    return NextResponse.json({ copied: 0 });
  }

  // Anchor every copy at local noon of the target day.
  const consumedAt = zonedWallToUtc(to, "12:00:00.000", user.timezone);

  await prisma.foodEntry.createMany({
    data: source.map((e) => ({
      userId: user.id,
      name: e.name,
      calories: e.calories,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
      fiber: e.fiber,
      sugar: e.sugar,
      sodium: e.sodium,
      mealType: e.mealType,
      consumedAt,
    })),
  });

  return NextResponse.json({ copied: source.length });
}
