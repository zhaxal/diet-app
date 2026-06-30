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
    // Derive recent foods from the last 30 days of entries, deduped by name.
    prisma.foodEntry.findMany({
      where: {
        userId: user.id,
        consumedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { consumedAt: "desc" },
      take: 200,
    }),
  ]);

  // Dedup recent entries by name (case-insensitive), keep the most-recent macros.
  const seen = new Set<string>();
  const recent = recentEntries
    .filter((e) => {
      const key = e.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20)
    .map(({ id: _id, userId: _u, createdAt: _c, consumedAt: _ca, ...rest }) => rest);

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
