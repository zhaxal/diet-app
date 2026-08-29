import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

interface OFFResponse {
  status?: number;
  product?: {
    product_name?: string;
    brands?: string;
    quantity?: string;
    serving_quantity?: number | string;
    serving_size?: string;
    nutriments?: Record<string, number | string | undefined>;
  };
}

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/**
 * GET /api/products/barcode/:code
 *
 * The saved catalog first — the whole point of saving a label is never reading
 * it again — then Open Food Facts as a fallback. Returns `source` so the caller
 * can say where the numbers came from rather than presenting a stranger's data
 * as the user's own.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { code } = await params;
  if (!/^\d{6,14}$/.test(code)) return jsonError("Not a barcode", 400);

  const saved = await prisma.product.findFirst({
    where: { userId: user.id, barcode: code },
  });
  if (saved) return NextResponse.json({ source: "saved", product: saved });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json` +
        "?fields=product_name,brands,quantity,serving_quantity,serving_size,nutriments",
      {
        headers: { "User-Agent": "DietTracker/1.0 (self-hosted personal app)" },
        signal: controller.signal,
      },
    );
    if (!res.ok) return NextResponse.json({ source: "none", product: null });

    const data = (await res.json()) as OFFResponse;
    if (data.status !== 1 || !data.product) {
      return NextResponse.json({ source: "none", product: null });
    }

    const p = data.product;
    const n = p.nutriments ?? {};
    // A drink is labelled per 100 ml. Open Food Facts does not say which basis
    // it used, but a `quantity` in ml is the reliable tell.
    const isDrink = /\b\d+\s*(ml|l|cl)\b/i.test(p.quantity ?? "");
    const servingSize = num(p.serving_quantity);

    return NextResponse.json({
      source: "openfoodfacts",
      product: {
        name: (p.product_name || "").trim() || `Barcode ${code}`,
        brand: (p.brands || "").split(",")[0]?.trim() || null,
        barcode: code,
        basis: isDrink ? "100ml" : "100g",
        calories: Math.round(num(n["energy-kcal_100g"])),
        protein: Math.round(num(n["proteins_100g"]) * 10) / 10,
        carbs: Math.round(num(n["carbohydrates_100g"]) * 10) / 10,
        fat: Math.round(num(n["fat_100g"]) * 10) / 10,
        fiber: Math.round(num(n["fiber_100g"]) * 10) / 10,
        sugar: Math.round(num(n["sugars_100g"]) * 10) / 10,
        // OFF reports salt in grams and sodium in grams; this app stores mg.
        sodium: Math.round(num(n["sodium_100g"]) * 1000),
        servingSize: servingSize > 0 ? servingSize : null,
        servingUnit: servingSize > 0 ? (isDrink ? "ml" : "g") : null,
      },
    });
  } catch {
    // Offline, or the lookup timed out. Not an error the user caused.
    return NextResponse.json({ source: "none", product: null });
  } finally {
    clearTimeout(timeout);
  }
}
