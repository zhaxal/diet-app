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

  // Bucket entries by their local calendar date in the user's tz.
  const byDate: Record<string, { calories: number; protein: number; carbs: number; fat: number; count: number }> = {};
  for (const date of dates) {
    byDate[date] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
  }
  for (const e of entries) {
    const date = localDateInTz(e.consumedAt, tz);
    if (byDate[date]) {
      byDate[date].calories += e.calories;
      byDate[date].protein += e.protein;
      byDate[date].carbs += e.carbs;
      byDate[date].fat += e.fat;
      byDate[date].count += 1;
    }
  }

  const nutrition = dates.map((date) => ({ date, ...byDate[date] }));

  // Last weight per local day in the range.
  const weightByDate: Record<string, number> = {};
  for (const w of weightLogs) {
    weightByDate[localDateInTz(w.loggedAt, tz)] = w.weight;
  }
  const weight = Object.entries(weightByDate).map(([date, value]) => ({ date, value }));

  return NextResponse.json({ days, nutrition, weight });
}
