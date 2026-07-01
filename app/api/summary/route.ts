import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { dateQuerySchema, MEAL_TYPES } from "@/lib/validation";
import { zodError, unauthorized } from "@/lib/http";
import { dayBoundsInTz, todayInTz } from "@/lib/time";

interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  count: number;
}

const emptyTotals = (): Totals => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
  count: 0,
});

// GET /api/summary?date=YYYY-MM-DD — daily nutrition totals for the current
// user, broken down per meal type plus a grand total. Defaults to today.
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const dateParam =
    req.nextUrl.searchParams.get("date") ?? todayInTz(user.timezone);

  const parsed = dateQuerySchema.safeParse(dateParam);
  if (!parsed.success) return zodError(parsed.error);

  const { start, end } = dayBoundsInTz(parsed.data, user.timezone);
  const entries = await prisma.foodEntry.findMany({
    where: { userId: user.id, consumedAt: { gte: start, lt: end } },
  });

  const byMeal: Record<string, Totals> = Object.fromEntries(
    MEAL_TYPES.map((m) => [m, emptyTotals()]),
  );
  const total = emptyTotals();

  for (const e of entries) {
    const bucket = byMeal[e.mealType] ?? emptyTotals();
    for (const t of [bucket, total]) {
      t.calories += e.calories;
      t.protein += e.protein;
      t.carbs += e.carbs;
      t.fat += e.fat;
      t.fiber += e.fiber;
      t.sugar += e.sugar;
      t.sodium += e.sodium;
      t.count += 1;
    }
  }

  return NextResponse.json({ date: parsed.data, total, byMeal });
}
