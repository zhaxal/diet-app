import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";

export const runtime = "nodejs";

interface OFFProduct {
  product_name?: string;
  brands?: string;
  nutriments?: Record<string, number | string | undefined>;
}

// GET /api/foods/search?q= — proxy Open Food Facts, returning per-100g nutrition.
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 200);
  if (!q) return NextResponse.json({ results: [] });

  const url =
    "https://world.openfoodfacts.org/cgi/search.pl?" +
    new URLSearchParams({
      search_terms: q,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "20",
      fields: "product_name,brands,nutriments",
    }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "DietTracker/1.0 (self-hosted personal app)" },
      signal: controller.signal,
    });

    if (!res.ok) return NextResponse.json({ results: [], unavailable: true });
    const data = (await res.json()) as { products?: OFFProduct[] };

    const num = (v: unknown) => {
      const n = typeof v === "string" ? parseFloat(v) : (v as number);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };

    const results = (data.products ?? [])
      .map((p) => {
        const n = p.nutriments ?? {};
        const name = [p.product_name, p.brands ? `(${p.brands})` : ""].filter(Boolean).join(" ").trim();
        const hasNutrition =
          n["energy-kcal_100g"] != null ||
          n["energy-kj_100g"] != null ||
          num(n["proteins_100g"]) > 0 ||
          num(n["carbohydrates_100g"]) > 0 ||
          num(n["fat_100g"]) > 0;
        const kcalRaw =
          n["energy-kcal_100g"] != null
            ? num(n["energy-kcal_100g"])
            : n["energy-kj_100g"] != null
              ? num(n["energy-kj_100g"]) / 4.184
              : 0;
        if (!name || (!hasNutrition && kcalRaw <= 0)) return [];
        return [{
          name,
          calories: Math.round(kcalRaw),
          protein: Math.round(num(n["proteins_100g"]) * 10) / 10,
          carbs: Math.round(num(n["carbohydrates_100g"]) * 10) / 10,
          fat: Math.round(num(n["fat_100g"]) * 10) / 10,
          fiber: Math.round(num(n["fiber_100g"]) * 10) / 10,
          sugar: Math.round(num(n["sugars_100g"]) * 10) / 10,
          sodium: Math.round(num(n["sodium_100g"]) * 1000), // g → mg
        }];
      })
      .slice(0, 15);

    return NextResponse.json({ results });
  } catch {
    // Network blocked or timed out — degrade gracefully to manual entry. The
    // flag is the difference between "Open Food Facts has no such food" and
    // "Open Food Facts could not be reached", which look identical otherwise
    // and lead to two different next moves.
    return NextResponse.json({ results: [], unavailable: true });
  } finally {
    clearTimeout(timeout);
  }
}
