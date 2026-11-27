import { z } from "zod";
import { isValidCalendarDate, isValidTimeZone } from "./time";
import { QUANTITY_UNITS, SERVING_UNITS, WEIGHT_UNITS } from "./units";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const credentialsSchema = z.object({
  email: z.string().email("A valid email is required").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(200),
    newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "The new password must be different from the current one",
    path: ["newPassword"],
  });

export const registerSchema = credentialsSchema.extend({
  // Only consulted when the server requires one; see lib/registration.ts.
  inviteCode: z.string().max(200).optional(),
});

const nutrient = () => z.number().min(0).max(1000000).optional().default(0);

// Shared shape for the nutritional fields of a food entry.
const entryBase = {
  name: z.string().min(1, "Food name is required").max(200),
  calories: z.number().int("Calories must be a whole number").min(0).max(100000),
  protein: nutrient(),
  carbs: nutrient(),
  fat: nutrient(),
  fiber: nutrient(),
  sugar: nutrient(),
  sodium: nutrient(), // mg
  mealType: z.enum(MEAL_TYPES),
  // Provenance when the entry came from a saved Product.
  productId: z.string().min(1).nullable().optional(),
  quantity: z.number().positive().max(100000).nullable().optional(),
  quantityUnit: z.enum(QUANTITY_UNITS).nullable().optional(),
  /** @deprecated Accepted for older callers; normalised to quantity + "g". */
  quantityGrams: z.number().positive().max(100000).nullable().optional(),
  // ISO 8601 timestamp; defaults to "now" server-side when omitted.
  consumedAt: z.string().datetime({ offset: true }).optional(),
};

export const createEntrySchema = z.object({
  ...entryBase,
  // Undo restores an eating event that already happened, so it has to be able
  // to say which front door originally wrote it. Everything else defaults to
  // "ui": this schema only serves the REST/browser door, and an omitted source
  // means the browser is authoring a new row rather than restoring an old one.
  source: z.enum(["ui", "mcp"]).optional(),
});

// All fields optional for partial updates, but at least one must be present.
export const updateEntrySchema = z
  .object({
    name: entryBase.name.optional(),
    calories: entryBase.calories.optional(),
    protein: z.number().min(0).max(1000000).optional(),
    carbs: z.number().min(0).max(1000000).optional(),
    fat: z.number().min(0).max(1000000).optional(),
    fiber: z.number().min(0).max(1000000).optional(),
    sugar: z.number().min(0).max(1000000).optional(),
    sodium: z.number().min(0).max(1000000).optional(),
    mealType: z.enum(MEAL_TYPES).optional(),
    // Correcting an amount is a correction like any other. Without these, a row
    // that says "250g" could have its calories halved and go on claiming 250g.
    quantity: z.number().positive().max(100000).nullable().optional(),
    quantityUnit: z.enum(QUANTITY_UNITS).nullable().optional(),
    consumedAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// YYYY-MM-DD date filter used by the list and summary endpoints.
export const dateQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine(isValidCalendarDate, "Date must be a valid calendar date");

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

const goalField = () => z.number().min(0).max(1000000).nullable().optional();

export const goalsSchema = z.object({
  dailyCalories: z.number().int().min(0).max(100000).nullable().optional(),
  dailyProtein: goalField(),
  dailyCarbs: goalField(),
  dailyFat: goalField(),
  dailyFiber: goalField(),
  dailySugar: goalField(),
  dailySodium: goalField(),
  weightUnit: z.enum(["kg", "lb"]).optional(),
  timezone: z
    .string()
    .refine(isValidTimeZone, "Invalid IANA timezone")
    .optional(),
  // TDEE profile.
  sex: z.enum(["male", "female"]).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
  heightCm: z.number().min(50).max(300).nullable().optional(),
});

export const weightSchema = z.object({
  weight: z.number().positive("Weight must be positive").max(1000),
  // Omitted means "the unit this account is set to". The row stores canonical
  // kilograms either way, so a later change of setting re-renders the reading
  // instead of reinterpreting it.
  unit: z.enum(WEIGHT_UNITS).optional(),
  loggedAt: z.string().datetime({ offset: true }).optional(),
});

export const favoriteSchema = z.object({
  name: z.string().min(1).max(200),
  calories: z.number().int().min(0).max(100000),
  protein: nutrient(),
  carbs: nutrient(),
  fat: nutrient(),
  fiber: nutrient(),
  sugar: nutrient(),
  sodium: nutrient(),
  mealType: z.enum(MEAL_TYPES).optional(),
});

// A single item inside a meal template. Carries the same provenance fields as an
// entry: a template built from product-logged rows must still know which product
// and how many grams, or applying it silently degrades the data.
export const templateItemSchema = z.object({
  name: z.string().min(1).max(200),
  calories: z.number().int().min(0).max(100000),
  protein: nutrient(),
  carbs: nutrient(),
  fat: nutrient(),
  fiber: nutrient(),
  sugar: nutrient(),
  sodium: nutrient(),
  mealType: z.enum(MEAL_TYPES),
  productId: z.string().min(1).nullable().optional(),
  quantity: z.number().positive().max(100000).nullable().optional(),
  quantityUnit: z.enum(QUANTITY_UNITS).nullable().optional(),
});

export const templateSchema = z.object({
  name: z.string().min(1).max(200),
  items: z
    .array(templateItemSchema)
    .min(1, "A template needs at least one item")
    .max(100, "A template may have at most 100 items"),
});

export const copyDaySchema = z.object({
  from: dateQuerySchema,
  to: dateQuerySchema,
});

export const applyTemplateSchema = z.object({
  date: dateQuerySchema,
});

export type GoalsInput = z.infer<typeof goalsSchema>;
export type WeightInput = z.infer<typeof weightSchema>;
export type FavoriteInput = z.infer<typeof favoriteSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type TemplateItem = z.infer<typeof templateItemSchema>;

// ── Products ──────────────────────────────────────────────────────────────
// Reference nutrition data, stored per 100 g/ml. Numeric strings from label OCR
// (e.g. "250") are accepted, while empty strings, null, and booleans are not.
function parseStrictNumber(v: unknown): unknown {
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return Number.NaN;
    return Number(trimmed);
  }
  if (typeof v === "boolean") return Number.NaN;
  return v;
}

const strictNum = (schema: z.ZodNumber) => z.preprocess(parseStrictNumber, schema);

const per100 = () =>
  strictNum(z.number().finite().min(0).max(1000000)).optional().default(0);

export const productSchema = z.object({
  name: z.string().min(1, "Product name is required").max(200),
  brand: z.string().max(200).nullable().optional(),
  barcode: z.string().max(64).nullable().optional(),
  basis: z.enum(["100g", "100ml"]).optional().default("100g"),
  calories: strictNum(z.number().finite().min(0).max(100000)),
  protein: per100(),
  carbs: per100(),
  fat: per100(),
  fiber: per100(),
  sugar: per100(),
  sodium: per100(), // mg
  servingSize: strictNum(z.number().finite().positive().max(100000)).nullable().optional(),
  servingUnit: z.enum(SERVING_UNITS).nullable().optional(),
  /** @deprecated Accepted for older callers; normalised to servingSize + base unit. */
  servingGrams: strictNum(z.number().finite().positive().max(100000)).nullable().optional(),
});

export const updateProductSchema = productSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: "At least one field must be provided" },
);

export type ProductInput = z.infer<typeof productSchema>;

export const workoutInputSchema = z.object({
  date: dateQuerySchema,
  title: z.string().max(200).optional().default("Workout"),
  rawNote: z.string().max(50_000),
  source: z.enum(["ui", "mcp"]).optional(),
});

export const workoutImportSchema = z
  .object({
    markdown: z.string().max(500_000).optional(),
    workouts: z
      .array(
        z.object({
          date: dateQuerySchema,
          title: z.string().max(200).optional(),
          note: z.string().max(50_000),
        }),
      )
      .max(365)
      .optional(),
    dryRun: z.boolean().optional(),
    overwrite: z.boolean().optional(),
  })
  .refine(
    (d) => Boolean(d.markdown?.trim()) || Boolean(d.workouts && d.workouts.length > 0),
    { message: "Provide markdown or workouts to import" },
  );
