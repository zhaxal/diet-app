import { scaleMacros, type Macros } from "./macros";
import { scaleFactor, type QuantityUnit } from "./units";

/** Scale from the saved reading, never from an already rounded preview. */
export function resizePortion(
  entry: Macros & { quantity?: number | null; quantityUnit?: QuantityUnit | null },
  quantity: number,
  quantityUnit: QuantityUnit,
): Macros | null {
  if (entry.quantity == null) return null;
  const factor = scaleFactor(
    { amount: quantity, unit: quantityUnit },
    { amount: entry.quantity, unit: entry.quantityUnit ?? "g" },
  );
  return factor === null ? null : scaleMacros(entry, factor);
}

/** A unit switch expresses the same portion, rather than changing its size. */
export function restateAmount(amount: string, from: QuantityUnit, to: QuantityUnit): string {
  if (!amount.trim()) return amount;
  const converted = scaleFactor({ amount: Number(amount), unit: from }, { amount: 1, unit: to });
  return converted === null ? amount : String(Math.round(converted * 1e6) / 1e6);
}
