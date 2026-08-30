/**
 * The seven numbers, and the one operation every capture path performs on them.
 *
 * Re-logging a favorite at double the amount, restating a per-100g label as the
 * 170 g actually eaten, and logging a copied entry at a new weight are the same
 * arithmetic. It lived in three places with three different rounding rules; the
 * rounding is a decision, so it lives here once.
 */

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export type MacroKey = keyof Macros;

export const MACRO_KEYS: MacroKey[] = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "fiber",
  "sugar",
  "sodium",
];

export const ZERO_MACROS: Macros = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
};

/**
 * Scaled to a new amount. Calories and sodium are whole numbers — calories
 * because the column is an integer, sodium because a tenth of a milligram is
 * beyond what any label states. The gram figures keep one decimal, which is the
 * precision labels are printed at.
 */
export function scaleMacros(m: Macros, factor: number): Macros {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const g = (n: number) => Math.round(n * f * 10) / 10;
  return {
    calories: Math.round(m.calories * f),
    protein: g(m.protein),
    carbs: g(m.carbs),
    fat: g(m.fat),
    fiber: g(m.fiber),
    sugar: g(m.sugar),
    sodium: Math.round(m.sodium * f),
  };
}

export type MacroStrings = Record<MacroKey, string>;

export const EMPTY_MACRO_STRINGS: MacroStrings = {
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  sugar: "",
  sodium: "",
};

/** Form fields → numbers. A blank field is zero, not NaN. */
export function parseMacros(s: MacroStrings): Macros {
  const n = (v: string) => {
    const parsed = Number(v);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  return {
    calories: Math.round(n(s.calories)),
    protein: n(s.protein),
    carbs: n(s.carbs),
    fat: n(s.fat),
    fiber: n(s.fiber),
    sugar: n(s.sugar),
    sodium: n(s.sodium),
  };
}

/** Numbers → form fields. A zero is shown as a zero, not as an empty box. */
export function macroStrings(m: Macros): MacroStrings {
  return {
    calories: String(m.calories),
    protein: String(m.protein),
    carbs: String(m.carbs),
    fat: String(m.fat),
    fiber: String(m.fiber),
    sugar: String(m.sugar),
    sodium: String(m.sodium),
  };
}

/** True when anything beyond the four headline figures carries a value. */
export function hasTrace(m: Macros): boolean {
  return m.fiber > 0 || m.sugar > 0 || m.sodium > 0;
}
