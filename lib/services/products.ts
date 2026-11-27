import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { normaliseServing, toBase, type Basis, type ServingUnit } from "../units";

export class ProductServiceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface ProductUpsertInput {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  basis: Basis;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize?: number | null;
  servingUnit?: ServingUnit | null;
  servingGrams?: number | null;
}

export function validateServingForBasis(
  basis: Basis,
  servingSize: number | null,
  servingUnit: ServingUnit | null,
): void {
  if (servingSize != null && servingUnit != null) {
    if (toBase(1, servingUnit, basis, null) === null) {
      throw new ProductServiceError(
        `Serving unit "${servingUnit}" is incompatible with basis "${basis}"`,
        422,
      );
    }
  }
}

export async function upsertProduct(
  userId: string,
  input: ProductUpsertInput,
  source: "manual" | "mcp" | "openfoodfacts" = "manual",
) {
  const cleanBrand = input.brand?.trim() || null;
  const barcodeProvided = input.barcode !== undefined;
  const cleanBarcode = input.barcode === undefined ? undefined : input.barcode?.trim() || null;

  const serving = normaliseServing(
    {
      servingSize: input.servingSize,
      servingUnit: input.servingUnit,
      servingGrams: input.servingGrams,
    },
    input.basis,
  );
  validateServingForBasis(input.basis, serving.servingSize, serving.servingUnit);

  const existing = cleanBarcode
    ? await prisma.product.findFirst({ where: { userId, barcode: cleanBarcode } })
    : await prisma.product.findFirst({
        where: { userId, name: input.name, brand: cleanBrand },
      });

  const baseData = {
    name: input.name,
    brand: cleanBrand,
    basis: input.basis,
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    fiber: input.fiber,
    sugar: input.sugar,
    sodium: input.sodium,
    ...serving,
  };

  try {
    if (existing) {
      const product = await prisma.product.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          // Preserve existing barcode when re-saving by name+brand without passing barcode;
          // only clear/overwrite when `barcode` was explicitly supplied.
          ...(barcodeProvided ? { barcode: cleanBarcode } : {}),
        },
      });
      return { product, created: false };
    }

    const product = await prisma.product.create({
      data: {
        ...baseData,
        barcode: cleanBarcode ?? null,
        userId,
        source,
      },
    });
    return { product, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      if (cleanBarcode) {
        const raced = await prisma.product.findFirst({
          where: { userId, barcode: cleanBarcode },
        });
        if (raced) {
          const product = await prisma.product.update({
            where: { id: raced.id },
            data: { ...baseData, barcode: cleanBarcode },
          });
          return { product, created: false };
        }
      }
      throw new ProductServiceError("A product with that barcode already exists", 409);
    }
    throw err;
  }
}

interface OFFResponse {
  status?: number;
  product?: {
    product_name?: string;
    brands?: string;
    quantity?: string;
    serving_quantity?: number | string;
    nutriments?: Record<string, number | string | undefined>;
  };
}

const nonNegNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export interface OFFBarcodeResult {
  name: string;
  brand: string | null;
  barcode: string;
  basis: Basis;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize: number | null;
  servingUnit: ServingUnit | null;
}

export async function lookupOrFetchBarcode(
  userId: string,
  code: string,
  opts?: { autoSave?: boolean },
): Promise<
  | { source: "saved"; product: Awaited<ReturnType<typeof prisma.product.findFirst>> & NonNullable<unknown> }
  | { source: "openfoodfacts"; product: OFFBarcodeResult; savedProduct?: Awaited<ReturnType<typeof prisma.product.create>> }
  | { source: "none"; product: null; fetchFailed?: boolean }
> {
  const saved = await prisma.product.findFirst({
    where: { userId, barcode: code },
  });
  if (saved) return { source: "saved", product: saved };

  let data: OFFResponse;
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
    if (!res.ok) return { source: "none", product: null };
    data = (await res.json()) as OFFResponse;
  } catch {
    return { source: "none", product: null, fetchFailed: true };
  } finally {
    clearTimeout(timeout);
  }

  if (data.status !== 1 || !data.product) {
    return { source: "none", product: null };
  }

  const p = data.product;
  const n = p.nutriments ?? {};
  const isDrink = /\b\d+\s*(ml|l|cl)\b/i.test(p.quantity ?? "");
  const basis: Basis = isDrink ? "100ml" : "100g";
  const servingQty = nonNegNum(p.serving_quantity);

  const kcalRaw =
    n["energy-kcal_100g"] != null
      ? nonNegNum(n["energy-kcal_100g"])
      : n["energy-kj_100g"] != null
        ? nonNegNum(n["energy-kj_100g"]) / 4.184
        : 0;

  const offProduct: OFFBarcodeResult = {
    name: (p.product_name || "").trim() || `Barcode ${code}`,
    brand: (p.brands || "").split(",")[0]?.trim() || null,
    barcode: code,
    basis,
    calories: Math.round(kcalRaw),
    protein: Math.round(nonNegNum(n["proteins_100g"]) * 10) / 10,
    carbs: Math.round(nonNegNum(n["carbohydrates_100g"]) * 10) / 10,
    fat: Math.round(nonNegNum(n["fat_100g"]) * 10) / 10,
    fiber: Math.round(nonNegNum(n["fiber_100g"]) * 10) / 10,
    sugar: Math.round(nonNegNum(n["sugars_100g"]) * 10) / 10,
    sodium: Math.round(nonNegNum(n["sodium_100g"]) * 1000),
    servingSize: servingQty > 0 ? servingQty : null,
    servingUnit: servingQty > 0 ? (isDrink ? "ml" : "g") : null,
  };

  if (opts?.autoSave) {
    const hasAnyNutrition =
      n["energy-kcal_100g"] != null ||
      n["energy-kj_100g"] != null ||
      offProduct.calories > 0 ||
      offProduct.protein > 0 ||
      offProduct.carbs > 0 ||
      offProduct.fat > 0;
    if (hasAnyNutrition) {
      const { product: savedProduct } = await upsertProduct(
        userId,
        offProduct,
        "openfoodfacts",
      );
      return { source: "openfoodfacts", product: offProduct, savedProduct };
    }
  }

  return { source: "openfoodfacts", product: offProduct };
}
