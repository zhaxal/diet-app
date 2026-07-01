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

  const q = req.nextUrl.searchParams.get("q")?.trim();
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

    if (!res.ok) return NextResponse.json({ results: [] });
    const data = (await res.json()) as { products?: OFFProduct[] };

    const num = (v: unknown) => {
      const n = typeof v === "string" ? parseFloat(v) : (v as number);
      return Number.isFinite(n) ? n : 0;
    };

    const results = (data.products ?? [])
      .map((p) => {
        const n = p.nutriments ?? {};
        const name = [p.product_name, p.brands ? `(${p.brands})` : ""].filter(Boolean).join(" ").trim();
        return {
          name,
          calories: Math.round(num(n["energy-kcal_100g"])),
          protein: Math.round(num(n["proteins_100g"]) * 10) / 10,
          carbs: Math.round(num(n["carbohydrates_100g"]) * 10) / 10,
          fat: Math.round(num(n["fat_100g"]) * 10) / 10,
          fiber: Math.round(num(n["fiber_100g"]) * 10) / 10,
          sugar: Math.round(num(n["sugars_100g"]) * 10) / 10,
          sodium: Math.round(num(n["sodium_100g"]) * 1000), // g → mg
        };
      })
      .filter((r) => r.name && r.calories > 0)
      .slice(0, 15);

    return NextResponse.json({ results });
  } catch {
    // Network blocked or timed out — degrade gracefully to manual entry.
    return NextResponse.json({ results: [] });
  } finally {
    clearTimeout(timeout);
  }
}
