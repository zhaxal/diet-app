import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { favoriteSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const [favorites, recentEntries] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    // The window is 30 days and now genuinely is: the old `take: 200` meant a
    // heavy logger's "last 30 days" quietly became the last thirteen.
    prisma.foodEntry.findMany({
      where: {
        userId: user.id,
        consumedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { consumedAt: "desc" },
      take: 2000,
    }),
  ]);

  // Anything already pinned is not offered again: a favorite sits in its own
  // strip directly above, and a duplicate spends the scarcest space in the app.
  const pinned = new Set(favorites.map((f) => f.name.toLowerCase()));

  // Aggregate rather than dedupe. Ranking by recency alone put a one-off from
  // yesterday above the porridge eaten every morning, so the strip reports the
  // facts a ranking needs — how often, how recently, and at which meals — and
  // the client scores them. That split matters because the score depends on the
  // meal selector, which changes without a round trip.
  type Agg = {
    name: string;
    count: number;
    lastAt: Date;
    byMeal: Record<string, number>;
    macros: Record<string, unknown>;
  };
  const byName = new Map<string, Agg>();

  for (const e of recentEntries) {
    const key = e.name.toLowerCase();
    if (pinned.has(key)) continue;

    const existing = byName.get(key);
    if (existing) {
      existing.count += 1;
      existing.byMeal[e.mealType] = (existing.byMeal[e.mealType] ?? 0) + 1;
      continue;
    }
    // Entries arrive newest-first, so the first one seen carries the macros and
    // the provenance — the values this food had the last time it was eaten.
    byName.set(key, {
      name: e.name,
      count: 1,
      lastAt: e.consumedAt,
      byMeal: { [e.mealType]: 1 },
      macros: {
        calories: e.calories,
        protein: e.protein,
        carbs: e.carbs,
        fat: e.fat,
        fiber: e.fiber,
        sugar: e.sugar,
        sodium: e.sodium,
        mealType: e.mealType,
        // Carried so re-logging keeps the product link and the amount. Dropping
        // these turned the most-used capture path into an anonymous row.
        productId: e.productId,
        quantity: e.quantity,
        quantityUnit: e.quantityUnit,
      },
    });
  }

  const recent = [...byName.values()]
    // A stable order for the payload; the client re-scores against the meal.
    .sort((a, b) => b.count - a.count || +b.lastAt - +a.lastAt)
    .slice(0, 30)
    .map((a) => ({
      ...a.macros,
      name: a.name,
      count: a.count,
      lastAt: a.lastAt.toISOString(),
      byMeal: a.byMeal,
    }));

  return NextResponse.json({ favorites, recent });
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

  const parsed = favoriteSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const favorite = await prisma.favorite.create({
    data: { userId: user.id, ...parsed.data },
  });

  return NextResponse.json({ favorite }, { status: 201 });
}
