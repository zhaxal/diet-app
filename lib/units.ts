/**
 * Unit conversion, in one place.
 *
 * The model had no unit column anywhere: nutrients were grams by convention,
 * sodium was milligrams by convention, `quantityGrams` was grams by *name*, and
 * `User.weightUnit` was a display label that never converted anything — so
 * switching kg to lb silently reinterpreted every historical reading rather
 * than re-rendering it.
 *
 * The rule this file exists to enforce: **a stored number is always canonical,
 * and the unit it was entered in is stored beside it.** Canonical is kilograms
 * for body weight, grams for mass, millilitres for volume. Display converts on
 * the way out; nothing converts on the way in except into canonical.
 */

// ── Body weight ────────────────────────────────────────────────────────────

export const WEIGHT_UNITS = ["kg", "lb"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

const LB_IN_KG = 0.45359237;

export function isWeightUnit(v: unknown): v is WeightUnit {
  return typeof v === "string" && (WEIGHT_UNITS as readonly string[]).includes(v);
}

/** A reading as entered → kilograms, which is what the column stores. */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === "lb" ? value * LB_IN_KG : value;
}

/** Kilograms → the unit the viewer has chosen, rounded to one decimal. */
export function fromKg(kg: number, unit: WeightUnit): number {
  const v = unit === "lb" ? kg / LB_IN_KG : kg;
  return Math.round(v * 10) / 10;
}

// ── Food quantity ──────────────────────────────────────────────────────────

/**
 * What a quantity can be measured in. `serving` is resolved against the
 * product's own declared serving, so it is only meaningful on an entry that
 * carries a productId.
 */
export const QUANTITY_UNITS = ["g", "oz", "ml", "floz", "serving"] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

/** The units a product may declare its serving in — `serving` would be circular. */
export const SERVING_UNITS = ["g", "oz", "ml", "floz"] as const;
export type ServingUnit = (typeof SERVING_UNITS)[number];

export type Basis = "100g" | "100ml";

const MASS_IN_G: Record<string, number> = { g: 1, oz: 28.349523125 };
const VOLUME_IN_ML: Record<string, number> = { ml: 1, floz: 29.5735295625 };

export const isMassUnit = (u: string) => u in MASS_IN_G;
export const isVolumeUnit = (u: string) => u in VOLUME_IN_ML;

export function isQuantityUnit(v: unknown): v is QuantityUnit {
  return typeof v === "string" && (QUANTITY_UNITS as readonly string[]).includes(v);
}

/** The base unit a product's nutrition is stated per 100 of. */
export const baseUnitFor = (basis: Basis): "g" | "ml" => (basis === "100ml" ? "ml" : "g");

/** Short label for display. `floz` is the only one that is not already prose. */
export function unitLabel(unit: QuantityUnit | ServingUnit): string {
  return unit === "floz" ? "fl oz" : unit;
}

/**
 * An amount with its unit, spaced and pluralised the way each unit reads.
 * "250ml" is right; "1serving" is not.
 */
export function formatQuantity(amount: number, unit: QuantityUnit | ServingUnit): string {
  const n = Math.round(amount * 100) / 100;
  if (unit === "serving") return `${n} ${n === 1 ? "serving" : "servings"}`;
  if (unit === "floz") return `${n} fl oz`;
  return `${n}${unit}`;
}

/**
 * Resolve a quantity to the product's own base unit (grams for a 100g product,
 * millilitres for a 100ml one), so the nutrition maths has one input.
 *
 * Returns null when the units are incompatible — asking for 200 ml of a product
 * measured per 100 g is a question with no answer, and guessing a density would
 * be inventing data. Callers surface that rather than substituting a number.
 */
export function toBase(
  quantity: number,
  unit: QuantityUnit,
  basis: Basis,
  serving?: { size: number; unit: ServingUnit } | null,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const base = baseUnitFor(basis);

  if (unit === "serving") {
    if (!serving || !(serving.size > 0)) return null;
    const per = toBase(serving.size, serving.unit, basis, null);
    return per === null ? null : per * quantity;
  }

  if (base === "g") {
    if (!isMassUnit(unit)) return null;
    return quantity * MASS_IN_G[unit];
  }
  if (!isVolumeUnit(unit)) return null;
  return quantity * VOLUME_IN_ML[unit];
}

/** The units that can be entered against a product, given how it was measured. */
export function unitsFor(basis: Basis, hasServing: boolean): QuantityUnit[] {
  const base: QuantityUnit[] = basis === "100ml" ? ["ml", "floz"] : ["g", "oz"];
  return hasServing ? [...base, "serving"] : base;
}

// ── Normalising older callers ──────────────────────────────────────────────
//
// `quantityGrams` and `servingGrams` were grams by name only, and both are still
// accepted so an assistant or script written against the old shape keeps working.
// They collapse into the quantity + unit pair here, once, rather than in every
// route.

export function normaliseQuantity(input: {
  quantity?: number | null;
  quantityUnit?: QuantityUnit | null;
  quantityGrams?: number | null;
}): { quantity: number | null; quantityUnit: QuantityUnit | null } {
  if (input.quantity != null) {
    return { quantity: input.quantity, quantityUnit: input.quantityUnit ?? "g" };
  }
  if (input.quantityGrams != null) {
    return { quantity: input.quantityGrams, quantityUnit: "g" };
  }
  return { quantity: null, quantityUnit: null };
}

export function normaliseServing(
  input: {
    servingSize?: number | null;
    servingUnit?: ServingUnit | null;
    servingGrams?: number | null;
  },
  basis: Basis,
): { servingSize: number | null; servingUnit: ServingUnit | null } {
  if (input.servingSize != null) {
    return {
      servingSize: input.servingSize,
      // A serving with no unit is stated in whatever the product is measured in.
      servingUnit: input.servingUnit ?? baseUnitFor(basis),
    };
  }
  if (input.servingGrams != null) {
    return { servingSize: input.servingGrams, servingUnit: baseUnitFor(basis) };
  }
  return { servingSize: null, servingUnit: null };
}

// ── Comparing two amounts ──────────────────────────────────────────────────
//
// `toBase` answers "how much of this product", which needs the product. The
// compose form asks a different question — "these numbers describe 250 g; what
// do 300 g look like?" — and that one has an answer without a product at all,
// as long as the two amounts share a dimension.

export type Dimension = "mass" | "volume" | "serving";

export function dimensionOf(unit: QuantityUnit): Dimension {
  if (isMassUnit(unit)) return "mass";
  if (isVolumeUnit(unit)) return "volume";
  return "serving";
}

/**
 * The units an amount may be restated in without inventing a density. A serving
 * is only comparable to another serving unless the product declares its size,
 * which is exactly when `unitsFor` is the right question instead.
 */
export function comparableUnits(unit: QuantityUnit): QuantityUnit[] {
  const d = dimensionOf(unit);
  return d === "mass" ? ["g", "oz"] : d === "volume" ? ["ml", "floz"] : ["serving"];
}

/** An amount reduced to its dimension's canonical unit: grams, or millilitres. */
function canonical(
  amount: number,
  unit: QuantityUnit,
  serving?: { size: number; unit: ServingUnit } | null,
): { dim: Dimension; value: number } | null {
  if (unit === "serving") {
    // Without a declared size a serving is only ever comparable to another
    // serving. Guessing grams here would be inventing the number the whole
    // module exists to refuse.
    if (!serving || !(serving.size > 0)) return { dim: "serving", value: amount };
    const inner = canonical(serving.size, serving.unit, null);
    return inner ? { dim: inner.dim, value: inner.value * amount } : null;
  }
  if (isMassUnit(unit)) return { dim: "mass", value: amount * MASS_IN_G[unit] };
  if (isVolumeUnit(unit)) return { dim: "volume", value: amount * VOLUME_IN_ML[unit] };
  return null;
}

/**
 * The factor that turns nutrition stated for `per` into nutrition for `want`.
 * Null when the two cannot be compared — 200 ml against a figure quoted per
 * 100 g, or a serving of something whose serving size nobody wrote down.
 */
export function scaleFactor(
  want: { amount: number; unit: QuantityUnit },
  per: { amount: number; unit: QuantityUnit },
  serving?: { size: number; unit: ServingUnit } | null,
): number | null {
  if (!Number.isFinite(want.amount) || want.amount <= 0) return null;
  if (!Number.isFinite(per.amount) || per.amount <= 0) return null;
  const a = canonical(want.amount, want.unit, serving);
  const b = canonical(per.amount, per.unit, serving);
  if (!a || !b || a.dim !== b.dim) return null;
  return a.value / b.value;
}
