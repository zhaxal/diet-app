import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { dayBoundsInTz, localDateInTz, todayInTz } from "@/lib/time";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const tz = user.timezone;
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam === "7" ? 7 : 30;

  // Build the list of local calendar dates (in the user's tz) ending today.
  const today = todayInTz(tz);
  const dates: string[] = [];
  const cursor = new Date(`${today}T00:00:00.000Z`);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Query window: local start of the first day → local end of today, as UTC instants.
  const { start } = dayBoundsInTz(dates[0], tz);
  const { end } = dayBoundsInTz(today, tz);

  const [entries, weightLogs] = await Promise.all([
    prisma.foodEntry.findMany({
      where: { userId: user.id, consumedAt: { gte: start, lt: end } },
      orderBy: { consumedAt: "asc" },
    }),
    prisma.weightLog.findMany({
      where: { userId: user.id, loggedAt: { gte: start, lt: end } },
      orderBy: { loggedAt: "asc" },
    }),
  ]);

  // Bucket entries by their local calendar date in the user's tz. All six
  // nutrients, not just the macros: the goals screen sets targets for every one
  // of them, so a range view that reported only three could not say whether the
  // average day met them.
  type DayTotals = {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
    count: number;
  };
  const emptyDay = (): DayTotals => ({
    calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, count: 0,
  });

  const byDate: Record<string, DayTotals> = {};
  for (const date of dates) byDate[date] = emptyDay();

  // Where the range's calories landed across the day. Totals, not averages —
  // the caller divides by whatever denominator it is willing to defend.
  const meals: Record<string, { calories: number; count: number }> = {
    breakfast: { calories: 0, count: 0 },
    lunch: { calories: 0, count: 0 },
    dinner: { calories: 0, count: 0 },
    snack: { calories: 0, count: 0 },
  };

  for (const e of entries) {
    const date = localDateInTz(e.consumedAt, tz);
    const day = byDate[date];
    if (!day) continue;
    day.calories += e.calories;
    day.protein += e.protein;
    day.carbs += e.carbs;
    day.fat += e.fat;
    day.fiber += e.fiber;
    day.sugar += e.sugar;
    day.sodium += e.sodium;
    day.count += 1;

    const bucket = meals[e.mealType];
    if (bucket) {
      bucket.calories += e.calories;
      bucket.count += 1;
    }
  }

  const nutrition = dates.map((date) => ({ date, ...byDate[date] }));

  // Last weight per local day in the range.
  const weightByDate: Record<string, number> = {};
  for (const w of weightLogs) {
    weightByDate[localDateInTz(w.loggedAt, tz)] = w.weight;
  }
  const weight = Object.entries(weightByDate).map(([date, value]) => ({ date, value }));

  return NextResponse.json({ days, nutrition, weight, meals });
}
