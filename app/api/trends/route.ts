import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { dayBoundsInTz, localDateInTz, todayInTz } from "@/lib/time";

/**
 * A window has to be describable two ways, because two callers ask for it
 * differently. Trends asks "the last 90 days" and does not know what day it is;
 * the week strip asks for seven named days that may sit anywhere in the past.
 * `from`/`to` wins when both are given.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ten years. Not a product limit — a guard against a malformed `from`. */
const MAX_SPAN_DAYS = 3660;

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const tz = user.timezone;
  const today = todayInTz(tz);
  const q = req.nextUrl.searchParams;
  const fromParam = q.get("from");
  const toParam = q.get("to");
  const daysParam = q.get("days");

  let from: string;
  let to: string;

  if (fromParam || toParam) {
    if (!fromParam || !DATE_RE.test(fromParam) || (toParam && !DATE_RE.test(toParam))) {
      return jsonError("from and to must be YYYY-MM-DD dates", 422);
    }
    from = fromParam;
    to = toParam ?? today;
    if (from > to) return jsonError("from must not be after to", 422);
  } else if (daysParam === "all") {
    // The whole record. Its start is the first thing this account ever logged —
    // an empty account gets today, not an arbitrary window of zeroes.
    const [firstEntry, firstWeight] = await Promise.all([
      prisma.foodEntry.findFirst({
        where: { userId: user.id },
        orderBy: { consumedAt: "asc" },
        select: { consumedAt: true },
      }),
      prisma.weightLog.findFirst({
        where: { userId: user.id },
        orderBy: { loggedAt: "asc" },
        select: { loggedAt: true },
      }),
    ]);
    const candidates = [
      firstEntry ? localDateInTz(firstEntry.consumedAt, tz) : null,
      firstWeight ? localDateInTz(firstWeight.loggedAt, tz) : null,
    ].filter((d): d is string => d !== null);
    from = candidates.length ? candidates.sort()[0] : today;
    to = today;
  } else {
    const n = Number(daysParam);
    const days = Number.isInteger(n) && n >= 1 && n <= MAX_SPAN_DAYS ? n : 30;
    to = today;
    from = shift(to, -(days - 1));
  }

  // A `from` far enough back to be a mistake is clamped rather than refused:
  // the caller still gets a real window, and the response says which one.
  if (daysBetween(from, to) > MAX_SPAN_DAYS) from = shift(to, -(MAX_SPAN_DAYS - 1));

  const dates: string[] = [];
  for (let d = from; d <= to; d = shift(d, 1)) dates.push(d);

  // Query window: local start of the first day → local end of the last, as UTC
  // instants.
  const { start } = dayBoundsInTz(from, tz);
  const { end } = dayBoundsInTz(to, tz);

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
  const weight = Object.entries(weightByDate)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // `days` is the width of the window that was actually served, which is not
  // always the width that was asked for — `all` resolves to one, and a clamped
  // `from` shortens one. A caller that echoes the request would mislabel both.
  return NextResponse.json({ days: dates.length, from, to, nutrition, weight, meals });
}
