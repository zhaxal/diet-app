import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";

// GET /api/export?format=json|csv — download all of the user's data.
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const stamp = new Date().toISOString().slice(0, 10);

  const [entries, weightLogs, favorites, templates, profile] = await Promise.all([
    prisma.foodEntry.findMany({ where: { userId: user.id }, orderBy: { consumedAt: "asc" } }),
    prisma.weightLog.findMany({ where: { userId: user.id }, orderBy: { loggedAt: "asc" } }),
    prisma.favorite.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.mealTemplate.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        email: true, dailyCalories: true, dailyProtein: true, dailyCarbs: true,
        dailyFat: true, dailyFiber: true, dailySugar: true, dailySodium: true,
        weightUnit: true, timezone: true, sex: true, birthYear: true, heightCm: true,
      },
    }),
  ]);

  if (format === "csv") {
    const cols = ["consumedAt", "mealType", "name", "calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium"] as const;
    const header = cols.join(",");
    const rows = entries.map((e) =>
      cols
        .map((c) => {
          const v = c === "consumedAt" ? e.consumedAt.toISOString() : (e as Record<string, unknown>)[c];
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="diet-entries-${stamp}.csv"`,
      },
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    profile,
    entries,
    weightLogs,
    favorites,
    templates: templates.map((t) => ({ ...t, items: JSON.parse(t.items) })),
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="diet-export-${stamp}.json"`,
    },
  });
}
