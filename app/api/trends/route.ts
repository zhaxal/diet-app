import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { dayBounds } from "@/lib/http";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam === "7" ? 7 : 30;

  const today = new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const startDate = dates[0];
  const { start } = dayBounds(startDate);
  const { end } = dayBounds(today);

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

  // Bucket entries by date.
  const byDate: Record<string, { calories: number; protein: number; carbs: number; fat: number; count: number }> = {};
  for (const date of dates) {
    byDate[date] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
  }
  for (const e of entries) {
    const date = e.consumedAt.toISOString().slice(0, 10);
    if (byDate[date]) {
      byDate[date].calories += e.calories;
      byDate[date].protein += e.protein;
      byDate[date].carbs += e.carbs;
      byDate[date].fat += e.fat;
      byDate[date].count += 1;
    }
  }

  const nutrition = dates.map((date) => ({ date, ...byDate[date] }));

  // Last weight per day in the range.
  const weightByDate: Record<string, number> = {};
  for (const w of weightLogs) {
    const date = w.loggedAt.toISOString().slice(0, 10);
    weightByDate[date] = w.weight;
  }
  const weight = Object.entries(weightByDate).map(([date, value]) => ({ date, value }));

  return NextResponse.json({ days, nutrition, weight });
}
