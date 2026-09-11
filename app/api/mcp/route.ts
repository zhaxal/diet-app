import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  dayBoundsInTz,
  todayInTz,
  isValidTimeZone,
  localDateInTz,
  zonedWallToUtc,
} from "@/lib/time";
import {
  baseUnitFor,
  fromKg,
  isWeightUnit,
  normaliseServing,
  toBase,
  unitLabel,
  formatQuantity,
  toKg,
  QUANTITY_UNITS,
  SERVING_UNITS,
  WEIGHT_UNITS,
  type Basis,
  type QuantityUnit,
  type ServingUnit,
  type WeightUnit,
} from "@/lib/units";
import {
  parseWorkoutNote,
  formatWorkoutNote,
  calculate1RM,
  normalizeExerciseName,
  parseMultiWorkoutMarkdown,
  generateObsidianExport,
} from "@/lib/workout-parser";
import {
  getExerciseSummary,
  getExerciseFullHistory,
  getWorkoutMacroSummary,
} from "@/lib/workout-stats";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

// Values arrive from a model reading a photographed nutrition label, so they
// may be strings ("250") rather than numbers. Coerce, then reject anything
// that still is not finite — never let NaN reach Prisma.
const num = (max = 1000000) =>
  z.coerce.number().finite("must be a finite number").min(0).max(max);
const optNum = (max = 1000000) => num(max).optional().default(0);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// A bare "YYYY-MM-DD" parses as midnight UTC, which lands on the wrong local
// day for most timezones. Anchor date-only values at local noon instead; full
// ISO timestamps already carry an offset and are passed through.
function resolveConsumedAt(value: string | undefined, tz: string): Date {
  if (!value) return new Date();
  if (DATE_ONLY.test(value)) return zonedWallToUtc(value, "12:00:00.000", tz);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid consumedAt: ${value}`);
  return d;
}

// ── Tool argument schemas ─────────────────────────────────────────────────

const mealItemSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    calories: num(100000).optional(),
    protein: optNum(),
    carbs: optNum(),
    fat: optNum(),
    fiber: optNum(),
    sugar: optNum(),
    sodium: optNum(),
    productId: z.string().min(1).optional(),
    quantity: num(100000).optional(),
    unit: z.enum(QUANTITY_UNITS).optional(),
    grams: num(100000).optional(),
  })
  .refine((a) => a.productId != null || (a.name != null && a.calories != null), {
    message: "Provide either productId (+ quantity) or both name and calories",
  });

const logMealSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    calories: num(100000).optional(),
    protein: optNum(),
    carbs: optNum(),
    fat: optNum(),
    fiber: optNum(),
    sugar: optNum(),
    sodium: optNum(),
    mealType: z.enum(MEALS),
    productId: z.string().min(1).optional(),
    quantity: num(100000).optional(),
    unit: z.enum(QUANTITY_UNITS).optional(),
    /** @deprecated Still accepted; means quantity in the product's base unit. */
    grams: num(100000).optional(),
    consumedAt: z.string().min(1).optional(),
  })
  .refine((a) => a.productId != null || (a.name != null && a.calories != null), {
    message:
      "Provide either productId (+ grams) or both name and calories",
  });

const logMealItemsSchema = z.object({
  mealType: z.enum(MEALS),
  consumedAt: z.string().min(1).optional(),
  items: z.array(mealItemSchema).min(1).max(30),
});

const productArgsSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).nullish(),
  barcode: z.string().max(64).nullish(),
  basis: z.enum(["100g", "100ml"]).optional().default("100g"),
  calories: num(100000),
  protein: optNum(),
  carbs: optNum(),
  fat: optNum(),
  fiber: optNum(),
  sugar: optNum(),
  sodium: optNum(),
  servingSize: num(100000).optional(),
  servingUnit: z.enum(SERVING_UNITS).optional(),
  /** @deprecated Still accepted; read as the product's own base unit. */
  servingGrams: num(100000).optional(),
});

const dateArgSchema = z.object({ date: z.string().regex(DATE_ONLY).optional() });
const idArgSchema = z.object({ id: z.string().min(1) });
const searchArgSchema = z.object({ query: z.string().max(200).optional() });

// set_goals writes straight to the User row, so the accepted keys are an
// explicit allow-list — never the raw argument object.
const goalsArgsSchema = z.object({
  dailyCalories: num(100000).nullish(),
  dailyProtein: num().nullish(),
  dailyCarbs: num().nullish(),
  dailyFat: num().nullish(),
  dailyFiber: num().nullish(),
  dailySugar: num().nullish(),
  dailySodium: num().nullish(),
  weightUnit: z.enum(["kg", "lb"]).optional(),
  timezone: z.string().optional(),
  sex: z.enum(["male", "female"]).nullish(),
  birthYear: z.coerce.number().int().min(1900).max(2100).nullish(),
  heightCm: num(300).nullish(),
});

const weightArgsSchema = z.object({
  weight: z.coerce.number().finite("must be a finite number").positive("Weight must be positive").max(1000),
  // Explicit beats implicit: the tool used to say "in your weight unit" and
  // store a bare number, so nothing recorded which unit that had been.
  unit: z.enum(WEIGHT_UNITS).optional(),
  loggedAt: z.string().min(1).optional(),
});

const favoriteArgsSchema = z.object({
  name: z.string().min(1).max(200),
  calories: num(100000),
  protein: optNum(),
  carbs: optNum(),
  fat: optNum(),
  fiber: optNum(),
  sugar: optNum(),
  sodium: optNum(),
  mealType: z.enum(MEALS).optional(),
});

const barcodeArgSchema = z.object({ barcode: z.string().min(1).max(64) });

const logWorkoutSchema = z.object({
  date: z.string().regex(DATE_ONLY).optional(),
  title: z.string().max(200).optional(),
  note: z.string().min(1, "Workout note text is required"),
});

const getWorkoutSchema = z.object({
  date: z.string().regex(DATE_ONLY).optional(),
});

const exerciseHistorySchema = z.object({
  exercise: z.string().min(1, "Exercise name is required"),
});

const suggestNextWorkoutSchema = z.object({
  routine: z.string().optional().default("Push Day"),
});

const importWorkoutsSchema = z.object({
  markdown: z.string().optional(),
  workouts: z
    .array(
      z.object({
        date: z.string().regex(DATE_ONLY),
        title: z.string().max(200).optional(),
        note: z.string().min(1),
      }),
    )
    .optional(),
  dryRun: z.boolean().optional().default(false),
  overwrite: z.boolean().optional().default(true),
});

const exportWorkoutsSchema = z.object({
  format: z.enum(["markdown", "json"]).optional().default("markdown"),
  startDate: z.string().regex(DATE_ONLY).optional(),
  endDate: z.string().regex(DATE_ONLY).optional(),
});

const workoutSummarySchema = z.object({
  days: z.coerce.number().min(1).max(365).optional().default(30),
});

const ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  log_meal: logMealSchema,
  get_summary: dateArgSchema,
  list_entries: dateArgSchema,
  delete_entry: idArgSchema,
  set_goals: goalsArgsSchema,
  log_weight: weightArgsSchema,
  list_weight: z.object({}).passthrough(),
  list_favorites: z.object({}).passthrough(),
  save_favorite: favoriteArgsSchema,
  save_product: productArgsSchema,
  search_products: searchArgSchema,
  delete_product: idArgSchema,
  lookup_barcode: barcodeArgSchema,
  log_meal_items: logMealItemsSchema,
  log_workout: logWorkoutSchema,
  get_workout: getWorkoutSchema,
  get_exercise_history: exerciseHistorySchema,
  suggest_next_workout: suggestNextWorkoutSchema,
  import_workouts: importWorkoutsSchema,
  export_workouts: exportWorkoutsSchema,
  get_workout_summary: workoutSummarySchema,
};


const nutrientProps = {
  protein: { type: "number", minimum: 0, description: "grams" },
  carbs: { type: "number", minimum: 0, description: "grams" },
  fat: { type: "number", minimum: 0, description: "grams" },
  fiber: { type: "number", minimum: 0, description: "grams" },
  sugar: { type: "number", minimum: 0, description: "grams" },
  sodium: { type: "number", minimum: 0, description: "milligrams" },
};

const TOOLS = [
  {
    name: "lookup_barcode",
    description:
      "Look up a food product by its barcode digits (EAN/UPC). Automatically checks the user's saved product catalog first. If not found locally, it queries Open Food Facts and AUTOMATICALLY saves the discovered product into the user's permanent catalog. ALWAYS call this when a barcode is visible in a photo or provided by the user.",
    inputSchema: {
      type: "object",
      required: ["barcode"],
      properties: {
        barcode: {
          type: "string",
          description: "EAN or UPC barcode digits (6 to 14 numeric digits)",
        },
      },
    },
  },
  {
    name: "save_product",
    description:
      "Save a product's nutrition label to the user's permanent catalog, with values per 100g/100ml. ALWAYS call this when you scan or read a nutrition table or macro table from a photo or text — this saves the product permanently to the user's library so they never have to photograph it again. Re-saving the same barcode (or same name+brand) updates the existing entry instead of duplicating it. After saving, use log_meal with the returned productId and quantity eaten.",
    inputSchema: {
      type: "object",
      required: ["name", "calories"],
      properties: {
        name: { type: "string", description: "Product name, e.g. 'Greek yoghurt 2%'" },
        brand: { type: "string", description: "Brand or manufacturer, if shown" },
        barcode: { type: "string", description: "EAN/UPC digits, if visible" },
        basis: { type: "string", enum: ["100g", "100ml"], description: "Whether the label values are per 100g or per 100ml. Default 100g." },
        calories: { type: "number", minimum: 0, description: "kcal per 100g/100ml" },
        ...nutrientProps,
        servingSize: { type: "number", minimum: 0, description: "One serving = N of servingUnit, if the label states it" },
        servingUnit: {
          type: "string",
          enum: [...SERVING_UNITS],
          description: "Unit the serving is stated in. Defaults to the product's own base unit (g for 100g, ml for 100ml).",
        },
      },
    },
  },
  {
    name: "search_products",
    description:
      "Search the user's saved product catalog by name or brand. Call this BEFORE asking the user to photograph a label — the product may already be saved. Returns productIds for use with log_meal.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or brand substring. Omit to list everything." },
      },
    },
  },
  {
    name: "delete_product",
    description: "Remove a product from the saved catalog by its ID.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Product ID from search_products" } },
    },
  },
  {
    name: "log_meal",
    description:
      "Log a food entry to a meal (breakfast, lunch, dinner, snack). PREFERRED: pass productId (from save_product, lookup_barcode, or search_products) plus quantity and unit — macros are computed automatically from the stored label. If the food has a nutrition label or barcode, ALWAYS save it via save_product or lookup_barcode before logging! Otherwise pass name and calories directly.",
    inputSchema: {
      type: "object",
      required: ["mealType"],
      properties: {
        productId: { type: "string", description: "Saved product to log from. With this, macros are computed server-side." },
        quantity: { type: "number", minimum: 0, description: "Amount eaten, in `unit`. Used with productId. Defaults to one serving, else 100 of the product's base unit." },
        unit: {
          type: "string",
          enum: [...QUANTITY_UNITS],
          description:
            "Unit of `quantity`. Must match how the product is measured: g/oz for a 100g product, ml/floz for a 100ml one, or 'serving' when the product declares one. Mismatches are rejected rather than guessed at.",
        },
        name: { type: "string", description: "Food name, when not logging from a product" },
        calories: { type: "integer", minimum: 0, description: "kcal, when not logging from a product" },
        ...nutrientProps,
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        consumedAt: { type: "string", description: "ISO 8601 timestamp, or YYYY-MM-DD for a whole day. Defaults to now." },
      },
    },
  },
  {
    name: "log_meal_items",
    description:
      "Log MULTIPLE food items to a meal (breakfast, lunch, dinner, snack) in a single tool call. ALWAYS use this when the user describes a full plate, combo, or multi-item meal (e.g. 150g chicken breast + 200g rice + 10g olive oil). Each item can reference a saved productId with quantity & unit, or provide name, calories, and macros directly.",
    inputSchema: {
      type: "object",
      required: ["mealType", "items"],
      properties: {
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        consumedAt: { type: "string", description: "ISO 8601 timestamp or YYYY-MM-DD. Defaults to now." },
        items: {
          type: "array",
          description: "List of foods eaten in this meal",
          items: {
            type: "object",
            properties: {
              productId: { type: "string", description: "Saved product ID if from catalog" },
              quantity: { type: "number", minimum: 0, description: "Amount eaten in unit" },
              unit: { type: "string", enum: [...QUANTITY_UNITS], description: "g, oz, ml, floz, serving" },
              name: { type: "string", description: "Food name (when not logging from productId)" },
              calories: { type: "integer", minimum: 0, description: "kcal (when not logging from productId)" },
              ...nutrientProps,
            },
          },
        },
      },
    },
  },
  {
    name: "get_summary",
    description: "Get daily nutrition totals (calories + macros) for a date, including progress toward daily goals if set.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD — defaults to today" } },
    },
  },
  {
    name: "list_entries",
    description: "List all food entries logged for a date.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD — defaults to today" } },
    },
  },
  {
    name: "delete_entry",
    description: "Delete a food entry by its ID.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Entry ID returned by log_meal or list_entries" } },
    },
  },
  {
    name: "set_goals",
    description: "Set daily calorie and macro targets. Pass null to clear a goal.",
    inputSchema: {
      type: "object",
      properties: {
        dailyCalories: { type: ["integer", "null"], description: "kcal target" },
        dailyProtein: { type: ["number", "null"], description: "grams" },
        dailyCarbs: { type: ["number", "null"], description: "grams" },
        dailyFat: { type: ["number", "null"], description: "grams" },
        dailyFiber: { type: ["number", "null"], description: "grams" },
        dailySugar: { type: ["number", "null"], description: "grams" },
        dailySodium: { type: ["number", "null"], description: "milligrams" },
        weightUnit: { type: "string", enum: ["kg", "lb"] },
        timezone: { type: "string", description: "IANA timezone, e.g. 'Asia/Almaty'" },
      },
    },
  },
  {
    name: "log_weight",
    description: "Log a body weight measurement.",
    inputSchema: {
      type: "object",
      required: ["weight"],
      properties: {
        weight: { type: "number", description: "The measurement, in `unit`" },
        unit: {
          type: "string",
          enum: [...WEIGHT_UNITS],
          description: "kg or lb. Defaults to the account's setting. Stored canonically either way.",
        },
        loggedAt: { type: "string", description: "ISO 8601 timestamp or YYYY-MM-DD — defaults to now" },
      },
    },
  },
  {
    name: "list_weight",
    description: "List recent weight log entries (last 30 days).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_favorites",
    description: "List saved favorites and recently eaten foods. Use these when logging recurring meals.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_favorite",
    description: "Save a ready-to-log food (absolute values for one portion) as a favorite. For a packaged product's label, use save_product instead.",
    inputSchema: {
      type: "object",
      required: ["name", "calories"],
      properties: {
        name: { type: "string" },
        calories: { type: "integer", minimum: 0 },
        ...nutrientProps,
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
      },
    },
  },
  {
    name: "log_workout",
    description: "Log or update a gym workout for a day using Obsidian-style markdown text. Automatically parses exercises, weights, reps, and detects PRs.",
    inputSchema: {
      type: "object",
      required: ["note"],
      properties: {
        date: { type: "string", description: "YYYY-MM-DD — defaults to today" },
        title: { type: "string", description: "Workout title, e.g. 'Push Day' or 'Legs'" },
        note: {
          type: "string",
          description: "Full markdown text of the workout (e.g. 'Bench Press\\n- 80kg x 8\\n- 85kg x 6\\n\\nIncline DB\\n- 30kg x 10')",
        },
      },
    },
  },
  {
    name: "get_workout",
    description: "Get the workout log and exercise performance stats for a date.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD — defaults to today" },
      },
    },
  },
  {
    name: "get_exercise_history",
    description: "Get performance progression, lifetime bests (top weight, 1RM), and past sessions for a specific exercise (e.g. 'Bench Press').",
    inputSchema: {
      type: "object",
      required: ["exercise"],
      properties: {
        exercise: { type: "string", description: "Name of the exercise" },
      },
    },
  },
  {
    name: "suggest_next_workout",
    description: "Inspects previous workouts for a routine (e.g. 'Push Day') and drafts a progressive overload workout note for today.",
    inputSchema: {
      type: "object",
      properties: {
        routine: { type: "string", description: "Routine title, e.g. 'Push Day', 'Pull Day', 'Legs'. Defaults to 'Push Day'." },
      },
    },
  },
  {
    name: "import_workouts",
    description: "Bulk import multiple workouts from Obsidian markdown text (e.g. journal with dated headings like '## 2026-09-08 Push Day') or a structured workouts array. Automatically extracts exercises, weights, and sets.",
    inputSchema: {
      type: "object",
      properties: {
        markdown: { type: "string", description: "Multi-day Obsidian notes markdown string" },
        workouts: {
          type: "array",
          description: "Structured array of workout objects",
          items: {
            type: "object",
            required: ["date", "note"],
            properties: {
              date: { type: "string", description: "YYYY-MM-DD" },
              title: { type: "string" },
              note: { type: "string" },
            },
          },
        },
        dryRun: { type: "boolean", description: "If true, only parses and returns a preview without saving to database" },
        overwrite: { type: "boolean", description: "If true (default), replaces existing workouts on the same dates" },
      },
    },
  },
  {
    name: "export_workouts",
    description: "Export all workouts in clean Obsidian markdown journal format (ready for an Obsidian vault) or structured JSON.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["markdown", "json"], description: "Default is 'markdown'" },
        startDate: { type: "string", description: "Optional start date filter (YYYY-MM-DD)" },
        endDate: { type: "string", description: "Optional end date filter (YYYY-MM-DD)" },
      },
    },
  },
  {
    name: "get_workout_summary",
    description: "Get comprehensive gym performance analytics: total volume (kg/lb), sessions frequency, total sets & reps, muscle group set distribution (Chest, Back, Legs, etc.), and recent workout logs.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365, description: "Timeframe in days (default: 30)" },
      },
    },
  },
];


function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}

const MACRO_KEYS = ["protein", "carbs", "fat", "fiber", "sugar", "sodium"] as const;

async function resolveMealItemEntry(
  a: z.infer<typeof mealItemSchema>,
  userId: string,
): Promise<{ entryData: Record<string, unknown>; provenance: string }> {
  let entryData: Record<string, unknown>;
  let provenance = "";

  if (a.productId) {
    const p = await prisma.product.findFirst({
      where: { id: a.productId, userId },
    });
    if (!p) throw new Error(`Product ${a.productId} not found`);

    const basis = p.basis as Basis;
    const serving =
      p.servingSize != null ? { size: p.servingSize, unit: p.servingUnit as ServingUnit } : null;

    const askedUnit: QuantityUnit =
      a.unit ??
      (a.quantity != null || a.grams != null
        ? baseUnitFor(basis)
        : serving
          ? "serving"
          : baseUnitFor(basis));
    const asked = a.quantity ?? a.grams ?? (askedUnit === "serving" ? 1 : 100);

    const base = toBase(asked, askedUnit, basis, serving);
    if (base === null) {
      throw new Error(
        `Cannot log ${formatQuantity(asked, askedUnit)} of "${p.name}", which is measured per ${p.basis}. ` +
          `Use ${baseUnitFor(basis)}${serving ? " or serving" : ""}.`,
      );
    }
    const f = base / 100;
    entryData = {
      name: p.brand ? `${p.name} (${p.brand})` : p.name,
      calories: Math.round(p.calories * f),
      protein: Math.round(p.protein * f * 10) / 10,
      carbs: Math.round(p.carbs * f * 10) / 10,
      fat: Math.round(p.fat * f * 10) / 10,
      fiber: Math.round(p.fiber * f * 10) / 10,
      sugar: Math.round(p.sugar * f * 10) / 10,
      sodium: Math.round(p.sodium * f),
      productId: p.id,
      quantity: asked,
      quantityUnit: askedUnit,
    };
    provenance =
      ` — ${formatQuantity(asked, askedUnit)}` +
      (askedUnit === "serving" ? ` (${base}${baseUnitFor(basis)})` : "") +
      " of saved product";
  } else {
    entryData = {
      name: a.name!,
      calories: Math.round(a.calories!),
      ...Object.fromEntries(MACRO_KEYS.map((k) => [k, a[k] ?? 0])),
    };
  }

  return { entryData, provenance };
}

async function callTool(
  name: string,
  rawArgs: Record<string, unknown>,
  userId: string,
  tz: string,
): Promise<string> {
  const schema = ARG_SCHEMAS[name];
  if (!schema) throw new Error(`Unknown tool: ${name}`);

  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    // Name the offending fields so the model can correct itself rather than
    // silently giving up (or asking for another photo).
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid arguments for ${name} — ${detail}`);
  }

  switch (name) {
    case "lookup_barcode": {
      const { barcode } = parsed.data as z.infer<typeof barcodeArgSchema>;
      const code = barcode.trim();
      if (!/^\d{6,14}$/.test(code)) {
        throw new Error(`Invalid barcode format: "${code}". Expected 6 to 14 numeric digits.`);
      }

      // 1. Check user's saved product catalog first
      const existing = await prisma.product.findFirst({
        where: { userId, barcode: code },
      });

      if (existing) {
        return (
          `Found saved product in catalog:\n` +
          `• Name: ${existing.name}${existing.brand ? ` (${existing.brand})` : ""}\n` +
          `• Barcode: ${existing.barcode}\n` +
          `• Basis: per ${existing.basis}\n` +
          `• Calories: ${existing.calories} kcal\n` +
          `• Macros: P ${existing.protein}g · C ${existing.carbs}g · F ${existing.fat}g (Fiber: ${existing.fiber}g, Sugar: ${existing.sugar}g, Sodium: ${existing.sodium}mg)\n` +
          `${existing.servingSize ? `• Serving size: ${existing.servingSize}${unitLabel(existing.servingUnit as ServingUnit)}\n` : ""}` +
          `• productId: ${existing.id}\n` +
          `Already in catalog! You can log it immediately with log_meal { productId: "${existing.id}", quantity, unit, mealType }.`
        );
      }

      // 2. Query Open Food Facts
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

        if (!res.ok) {
          return `Barcode ${code} not found on Open Food Facts. Please ask the user for a photo of the nutrition label, read the values, and call 'save_product' to save it.`;
        }

        const data = (await res.json()) as {
          status?: number;
          product?: {
            product_name?: string;
            brands?: string;
            quantity?: string;
            serving_quantity?: number | string;
            nutriments?: Record<string, number | string | undefined>;
          };
        };

        if (data.status !== 1 || !data.product) {
          return `Barcode ${code} not found in catalog or Open Food Facts. Please ask the user for a photo of the nutrition label, read the values, and call 'save_product' to save it.`;
        }

        const p = data.product;
        const n = p.nutriments ?? {};
        const isDrink = /\b\d+\s*(ml|l|cl)\b/i.test(p.quantity ?? "");
        const parseNum = (v: unknown) => {
          const numVal = typeof v === "string" ? parseFloat(v) : (v as number);
          return Number.isFinite(numVal) ? numVal : 0;
        };
        const sSize = parseNum(p.serving_quantity);

        const saved = await prisma.product.create({
          data: {
            userId,
            name: (p.product_name || "").trim() || `Barcode ${code}`,
            brand: (p.brands || "").split(",")[0]?.trim() || null,
            barcode: code,
            basis: isDrink ? "100ml" : "100g",
            calories: Math.round(parseNum(n["energy-kcal_100g"])),
            protein: Math.round(parseNum(n["proteins_100g"]) * 10) / 10,
            carbs: Math.round(parseNum(n["carbohydrates_100g"]) * 10) / 10,
            fat: Math.round(parseNum(n["fat_100g"]) * 10) / 10,
            fiber: Math.round(parseNum(n["fiber_100g"]) * 10) / 10,
            sugar: Math.round(parseNum(n["sugars_100g"]) * 10) / 10,
            sodium: Math.round(parseNum(n["sodium_100g"]) * 1000),
            servingSize: sSize > 0 ? sSize : null,
            servingUnit: sSize > 0 ? (isDrink ? "ml" : "g") : null,
            source: "openfoodfacts",
          },
        });

        return (
          `Found on Open Food Facts and AUTOMATICALLY SAVED to your product catalog!\n` +
          `• Name: ${saved.name}${saved.brand ? ` (${saved.brand})` : ""}\n` +
          `• Barcode: ${saved.barcode}\n` +
          `• Basis: per ${saved.basis}\n` +
          `• Calories: ${saved.calories} kcal\n` +
          `• Macros: P ${saved.protein}g · C ${saved.carbs}g · F ${saved.fat}g (Fiber: ${saved.fiber}g, Sugar: ${saved.sugar}g, Sodium: ${saved.sodium}mg)\n` +
          `${saved.servingSize ? `• Serving size: ${saved.servingSize}${unitLabel(saved.servingUnit as ServingUnit)}\n` : ""}` +
          `• productId: ${saved.id}\n` +
          `Saved permanently. You can log it immediately with log_meal { productId: "${saved.id}", quantity, unit, mealType }.`
        );
      } catch {
        return (
          `Barcode lookup for ${code} timed out or could not reach Open Food Facts. ` +
          `Please provide or read the nutrition label and call 'save_product' to save it manually.`
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    case "save_product": {
      const a = parsed.data as z.infer<typeof productArgsSchema>;
      const data = {
        name: a.name,
        brand: a.brand ?? null,
        barcode: a.barcode ?? null,
        basis: a.basis,
        calories: a.calories,
        protein: a.protein,
        carbs: a.carbs,
        fat: a.fat,
        fiber: a.fiber,
        sugar: a.sugar,
        sodium: a.sodium,
        ...normaliseServing(
          { servingSize: a.servingSize, servingUnit: a.servingUnit, servingGrams: a.servingGrams },
          a.basis as Basis,
        ),
        source: "mcp",
      };

      // Re-reading the same label should update, not duplicate.
      const existing = a.barcode
        ? await prisma.product.findFirst({ where: { userId, barcode: a.barcode } })
        : await prisma.product.findFirst({
            where: { userId, name: a.name, brand: a.brand ?? null },
          });

      const p = existing
        ? await prisma.product.update({ where: { id: existing.id }, data })
        : await prisma.product.create({ data: { ...data, userId } });

      return (
        `${existing ? "Updated" : "Saved"} product "${p.name}"${p.brand ? ` (${p.brand})` : ""} — ` +
        `per ${p.basis}: ${p.calories} kcal · P ${p.protein}g · C ${p.carbs}g · F ${p.fat}g` +
        `${p.servingSize ? ` · serving ${p.servingSize}${unitLabel(p.servingUnit as ServingUnit)}` : ""}\n` +
        `productId: ${p.id} — log it with log_meal { productId, quantity, unit, mealType }.`
      );
    }

    case "search_products": {
      const { query } = parsed.data as z.infer<typeof searchArgSchema>;
      const products = await prisma.product.findMany({
        where: {
          userId,
          ...(query
            ? {
                OR: [
                  { name: { contains: query } },
                  { brand: { contains: query } },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      if (products.length === 0) {
        return query
          ? `No saved products match "${query}". Ask for a photo of the label, then call save_product.`
          : "No products saved yet. Photograph a nutrition label and call save_product.";
      }
      return products
        .map(
          (p) =>
            `[${p.id}] ${p.name}${p.brand ? ` — ${p.brand}` : ""} · per ${p.basis}: ` +
            `${p.calories} kcal, P${p.protein} C${p.carbs} F${p.fat}` +
            `${p.servingSize ? ` · serving ${p.servingSize}${unitLabel(p.servingUnit as ServingUnit)}` : ""}`,
        )
        .join("\n");
    }

    case "delete_product": {
      const { id } = parsed.data as z.infer<typeof idArgSchema>;
      const p = await prisma.product.findFirst({ where: { id, userId } });
      if (!p) throw new Error(`Product ${id} not found`);
      await prisma.product.delete({ where: { id } });
      return `Deleted product "${p.name}"`;
    }

    case "log_meal": {
      const a = parsed.data as z.infer<typeof logMealSchema>;
      const consumedAt = resolveConsumedAt(a.consumedAt, tz);
      const { entryData, provenance } = await resolveMealItemEntry(a, userId);

      const entry = await prisma.foodEntry.create({
        // Stamped so the screen can show which front door wrote the row.
        data: { userId, ...entryData, source: "mcp", mealType: a.mealType, consumedAt } as never,
      });

      // Report the local date so a wrong-day write is visible immediately.
      return (
        `Logged "${entry.name}"${provenance} — ${entry.calories} kcal` +
        ` · P ${entry.protein}g · C ${entry.carbs}g · F ${entry.fat}g` +
        ` (${entry.mealType} on ${localDateInTz(entry.consumedAt, tz)}, id: ${entry.id})`
      );
    }

    case "log_meal_items": {
      const a = parsed.data as z.infer<typeof logMealItemsSchema>;
      const consumedAt = resolveConsumedAt(a.consumedAt, tz);

      const resolved = await Promise.all(
        a.items.map((item) => resolveMealItemEntry(item, userId)),
      );

      const createdEntries = await Promise.all(
        resolved.map(({ entryData }) =>
          prisma.foodEntry.create({
            data: { userId, ...entryData, source: "mcp", mealType: a.mealType, consumedAt } as never,
          }),
        ),
      );

      const totals = createdEntries.reduce(
        (acc, e) => ({
          calories: acc.calories + e.calories,
          protein: Math.round((acc.protein + e.protein) * 10) / 10,
          carbs: Math.round((acc.carbs + e.carbs) * 10) / 10,
          fat: Math.round((acc.fat + e.fat) * 10) / 10,
          fiber: Math.round((acc.fiber + e.fiber) * 10) / 10,
          sugar: Math.round((acc.sugar + e.sugar) * 10) / 10,
          sodium: Math.round(acc.sodium + e.sodium),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 },
      );

      const itemsSummary = createdEntries
        .map(
          (e, idx) =>
            `  • "${e.name}"${resolved[idx].provenance}: ${e.calories} kcal · P ${e.protein}g · C ${e.carbs}g · F ${e.fat}g (id: ${e.id})`,
        )
        .join("\n");

      return (
        `Logged ${createdEntries.length} items to ${a.mealType} on ${localDateInTz(consumedAt, tz)}:\n` +
        itemsSummary +
        `\nMeal total: ${totals.calories} kcal · P ${totals.protein}g · C ${totals.carbs}g · F ${totals.fat}g`
      );
    }

    case "get_summary": {
      const { date: d } = parsed.data as z.infer<typeof dateArgSchema>;
      const date = d ?? todayInTz(tz);
      const { start, end } = dayBoundsInTz(date, tz);
      const [entries, user] = await Promise.all([
        prisma.foodEntry.findMany({ where: { userId, consumedAt: { gte: start, lt: end } } }),
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            dailyCalories: true, dailyProtein: true, dailyCarbs: true, dailyFat: true,
            dailyFiber: true, dailySugar: true, dailySodium: true,
          },
        }),
      ]);
      const t = entries.reduce(
        (acc, e) => ({
          calories: acc.calories + e.calories, protein: acc.protein + e.protein,
          carbs: acc.carbs + e.carbs, fat: acc.fat + e.fat, fiber: acc.fiber + e.fiber,
          sugar: acc.sugar + e.sugar, sodium: acc.sodium + e.sodium, count: acc.count + 1,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, count: 0 },
      );
      const r = (n: number) => Math.round(n * 10) / 10;
      const line = (label: string, val: number, goal: number | null, unit: string) =>
        (goal ? ` ${label}: ${r(val)} / ${goal} (${Math.round((val / goal) * 100)}%)` : ` ${label}: ${r(val)}`) + unit;
      return (
        `Summary for ${date} (${t.count} entr${t.count === 1 ? "y" : "ies"})\n` +
        line("Calories", t.calories, user?.dailyCalories ?? null, " kcal") + "\n" +
        line("Protein", t.protein, user?.dailyProtein ?? null, "g") + "\n" +
        line("Carbs", t.carbs, user?.dailyCarbs ?? null, "g") + "\n" +
        line("Fat", t.fat, user?.dailyFat ?? null, "g") + "\n" +
        line("Fiber", t.fiber, user?.dailyFiber ?? null, "g") + "\n" +
        line("Sugar", t.sugar, user?.dailySugar ?? null, "g") + "\n" +
        line("Sodium", t.sodium, user?.dailySodium ?? null, "mg")
      );
    }

    case "list_entries": {
      const { date: d } = parsed.data as z.infer<typeof dateArgSchema>;
      const date = d ?? todayInTz(tz);
      const { start, end } = dayBoundsInTz(date, tz);
      const entries = await prisma.foodEntry.findMany({
        where: { userId, consumedAt: { gte: start, lt: end } },
        orderBy: { consumedAt: "asc" },
      });
      if (entries.length === 0) return `No entries for ${date}.`;
      return entries
        .map((e) => `[${e.id}] ${e.mealType} — ${e.name}: ${e.calories} kcal (P:${e.protein}g C:${e.carbs}g F:${e.fat}g)`)
        .join("\n");
    }

    case "delete_entry": {
      const { id } = parsed.data as z.infer<typeof idArgSchema>;
      const entry = await prisma.foodEntry.findFirst({ where: { id, userId } });
      if (!entry) throw new Error(`Entry ${id} not found`);
      await prisma.foodEntry.delete({ where: { id } });
      return `Deleted "${entry.name}"`;
    }

    case "set_goals": {
      const a = parsed.data as z.infer<typeof goalsArgsSchema>;
      if (a.timezone != null && !isValidTimeZone(a.timezone)) {
        throw new Error(`Invalid timezone: ${a.timezone}`);
      }
      // Only keys the caller actually supplied, and only allow-listed ones.
      const data = Object.fromEntries(
        Object.entries(a).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(data).length === 0) throw new Error("No goal fields provided");
      await prisma.user.update({ where: { id: userId }, data });
      return `Goals updated — ${Object.entries(data).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    }

    case "log_weight": {
      const a = parsed.data as z.infer<typeof weightArgsSchema>;
      const owner = await prisma.user.findUnique({ where: { id: userId }, select: { weightUnit: true } });
      const display: WeightUnit = isWeightUnit(owner?.weightUnit) ? (owner!.weightUnit as WeightUnit) : "kg";
      const entered: WeightUnit = a.unit ?? display;

      const log = await prisma.weightLog.create({
        data: {
          userId,
          weight: toKg(a.weight, entered),
          unit: entered,
          loggedAt: resolveConsumedAt(a.loggedAt, tz),
        },
      });
      return (
        `Logged ${a.weight} ${entered} on ${localDateInTz(log.loggedAt, tz)} (id: ${log.id})` +
        (entered === display ? "" : ` — shown as ${fromKg(log.weight, display)} ${display} in the app`)
      );
    }

    case "list_weight": {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [logs, user] = await Promise.all([
        prisma.weightLog.findMany({ where: { userId, loggedAt: { gte: since } }, orderBy: { loggedAt: "asc" } }),
        prisma.user.findUnique({ where: { id: userId }, select: { weightUnit: true } }),
      ]);
      if (logs.length === 0) return "No weight logs in the last 30 days.";
      // Rendered in the account's unit from the canonical column, so this is
      // the same measurement the screen shows.
      const shown: WeightUnit = isWeightUnit(user?.weightUnit) ? (user!.weightUnit as WeightUnit) : "kg";
      return logs
        .map((l) => `[${l.id}] ${localDateInTz(l.loggedAt, tz)}: ${fromKg(l.weight, shown)} ${shown}`)
        .join("\n");
    }

    case "list_favorites": {
      const [favorites, recent] = await Promise.all([
        prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
        prisma.foodEntry.findMany({
          where: { userId, consumedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { consumedAt: "desc" },
          take: 100,
        }),
      ]);
      const seen = new Set<string>();
      const recentUniq = recent.filter((e) => { const k = e.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
      const favLines = favorites.map((f) => `★ [fav:${f.id}] ${f.name}: ${f.calories} kcal (P:${f.protein} C:${f.carbs} F:${f.fat})${f.mealType ? ` — ${f.mealType}` : ""}`);
      const recentLines = recentUniq.map((e) => `  ${e.name}: ${e.calories} kcal (P:${e.protein} C:${e.carbs} F:${e.fat}) — ${e.mealType}`);
      return (favLines.length ? "Favorites:\n" + favLines.join("\n") + "\n\n" : "") +
        (recentLines.length ? "Recent:\n" + recentLines.join("\n") : "No recent foods.");
    }

    case "save_favorite": {
      const a = parsed.data as z.infer<typeof favoriteArgsSchema>;
      const fav = await prisma.favorite.create({ data: { userId, ...a } });
      return `Saved "${fav.name}" as a favorite (id: ${fav.id})`;
    }

    case "log_workout": {
      const { date: dateParam, title, note } = parsed.data as z.infer<typeof logWorkoutSchema>;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { weightUnit: true } });
      const userUnit: WeightUnit = isWeightUnit(user?.weightUnit) ? (user!.weightUnit as WeightUnit) : "kg";

      const targetDateStr = dateParam ?? todayInTz(tz);
      const workoutUtcDate = zonedWallToUtc(targetDateStr, "12:00:00.000", tz);
      const { start, end } = dayBoundsInTz(targetDateStr, tz);

      const parsedWorkout = parseWorkoutNote(note, userUnit);
      const resolvedTitle = parsedWorkout.title && parsedWorkout.title !== "Workout"
        ? parsedWorkout.title
        : title || "Workout";

      const saved = await prisma.$transaction(async (tx) => {
        let existing = await tx.workout.findFirst({
          where: { userId, date: { gte: start, lt: end } },
        });

        if (!existing) {
          existing = await tx.workout.create({
            data: {
              userId,
              date: workoutUtcDate,
              title: resolvedTitle,
              rawNote: note,
              notes: parsedWorkout.notes,
              source: "mcp",
            },
          });
        } else {
          await tx.workoutExercise.deleteMany({ where: { workoutId: existing.id } });
          existing = await tx.workout.update({
            where: { id: existing.id },
            data: {
              title: resolvedTitle,
              rawNote: note,
              notes: parsedWorkout.notes,
              source: "mcp",
              updatedAt: new Date(),
            },
          });
        }

        for (let i = 0; i < parsedWorkout.exercises.length; i++) {
          const parsedEx = parsedWorkout.exercises[i];
          const exercise = await tx.exercise.upsert({
            where: { userId_normalized: { userId, normalized: parsedEx.normalized } },
            update: { name: parsedEx.name },
            create: { userId, name: parsedEx.name, normalized: parsedEx.normalized },
          });

          const we = await tx.workoutExercise.create({
            data: {
              workoutId: existing.id,
              exerciseId: exercise.id,
              order: i,
              notes: parsedEx.notes,
            },
          });

          if (parsedEx.sets.length > 0) {
            await tx.workoutSet.createMany({
              data: parsedEx.sets.map((s) => ({
                workoutExerciseId: we.id,
                setNumber: s.setNumber,
                weight: toKg(s.weight, s.unit),
                unit: s.unit,
                reps: s.reps,
                isWarmup: s.isWarmup,
                isBodyweight: s.isBodyweight,
                rpe: s.rpe,
              })),
            });
          }
        }

        return existing;
      });

      const lines: string[] = [
        `Logged workout "${saved.title}" for ${targetDateStr}:`,
      ];
      for (const ex of parsedWorkout.exercises) {
        const topSet = [...ex.sets].sort((a, b) => b.weight - a.weight)[0];
        lines.push(
          `• ${ex.name}: ${ex.sets.length} set${ex.sets.length === 1 ? "" : "s"}${
            topSet ? ` (top: ${topSet.weight}${topSet.unit} × ${topSet.reps})` : ""
          }`,
        );
      }
      return lines.join("\n");
    }

    case "get_workout": {
      const { date: dateParam } = parsed.data as z.infer<typeof getWorkoutSchema>;
      const targetDateStr = dateParam ?? todayInTz(tz);
      const { start, end } = dayBoundsInTz(targetDateStr, tz);

      const workout = await prisma.workout.findFirst({
        where: { userId, date: { gte: start, lt: end } },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: {
              exercise: true,
              sets: { orderBy: { setNumber: "asc" } },
            },
          },
        },
      });

      if (!workout) {
        return `No workout logged for ${targetDateStr}.`;
      }

      const lines: string[] = [
        `# ${workout.title} (${targetDateStr})`,
        "",
        workout.rawNote,
      ];
      return lines.join("\n");
    }

    case "get_exercise_history": {
      const { exercise: rawName } = parsed.data as z.infer<typeof exerciseHistorySchema>;
      const norm = normalizeExerciseName(rawName);

      const ex = await prisma.exercise.findFirst({
        where: { userId, normalized: norm },
      });

      if (!ex) {
        return `Exercise "${rawName}" not found in your workout history.`;
      }

      const user = await prisma.user.findUnique({ where: { id: userId }, select: { weightUnit: true } });
      const userUnit: WeightUnit = isWeightUnit(user?.weightUnit) ? (user!.weightUnit as WeightUnit) : "kg";

      const history = await getExerciseFullHistory(userId, ex.id, userUnit);
      if (!history || history.sessions.length === 0) {
        return `No sessions logged yet for "${ex.name}".`;
      }

      const lines: string[] = [
        `# History: ${ex.name}`,
        `• Lifetime Best Weight: ${history.lifetime.bestWeight} ${userUnit}`,
        `• Lifetime Best 1RM: ${history.lifetime.best1RM} ${userUnit}`,
        `• Total Sessions: ${history.lifetime.totalSessions}`,
        "",
        "Recent Sessions:",
      ];

      const recentSessions = [...history.sessions].reverse().slice(0, 5);
      for (const s of recentSessions) {
        const setStrings = s.sets.map((set) => `${set.weight}${userUnit} × ${set.reps}`);
        lines.push(`• ${s.date} (${s.workoutTitle}): ${setStrings.join(", ")}`);
      }

      return lines.join("\n");
    }

    case "suggest_next_workout": {
      const { routine } = parsed.data as z.infer<typeof suggestNextWorkoutSchema>;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { weightUnit: true } });
      const userUnit: WeightUnit = isWeightUnit(user?.weightUnit) ? (user!.weightUnit as WeightUnit) : "kg";

      const prev = await prisma.workout.findFirst({
        where: {
          userId,
          title: { contains: routine },
        },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: {
              exercise: true,
              sets: { orderBy: { setNumber: "asc" } },
            },
          },
        },
        orderBy: { date: "desc" },
      });

      if (!prev || prev.exercises.length === 0) {
        return (
          `# ${routine}\n\n` +
          `Bench Press\n- 60${userUnit} x 8\n- 60${userUnit} x 8\n\n` +
          `Incline Dumbbell Press\n- 22${userUnit} x 10\n- 22${userUnit} x 10\n\n` +
          `Tricep Pushdown\n- 25${userUnit} x 12\n- 25${userUnit} x 12\n`
        );
      }

      const weightStep = userUnit === "lb" ? 5 : 2.5;
      const suggestedExercises = prev.exercises.map((we) => {
        const sets = we.sets.map((s) => {
          const w = fromKg(s.weight, userUnit);
          const nextReps = s.reps >= 10 ? 8 : s.reps + 1;
          const nextWeight = s.reps >= 10 ? Math.round((w + weightStep) * 10) / 10 : w;
          return {
            weight: nextWeight,
            unit: userUnit,
            reps: nextReps,
            isWarmup: s.isWarmup,
            isBodyweight: s.isBodyweight,
          };
        });

        return {
          name: we.exercise.name,
          sets,
        };
      });

      return formatWorkoutNote({
        title: prev.title,
        exercises: suggestedExercises,
      });
    }

    case "import_workouts": {
      const { markdown, workouts: rawWorkouts, dryRun, overwrite } = parsed.data as z.infer<typeof importWorkoutsSchema>;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { weightUnit: true } });
      const userUnit: WeightUnit = isWeightUnit(user?.weightUnit) ? (user!.weightUnit as WeightUnit) : "kg";

      let itemsToImport: Array<{ date: string; title: string; rawNote: string }> = [];

      if (markdown) {
        const parsed = parseMultiWorkoutMarkdown(markdown, userUnit);
        itemsToImport = parsed.map((p) => ({
          date: p.date,
          title: p.title,
          rawNote: p.rawNote,
        }));
      } else if (rawWorkouts) {
        itemsToImport = rawWorkouts.map((w) => ({
          date: w.date,
          title: w.title || "Workout",
          rawNote: w.note,
        }));
      } else {
        throw new Error("Must provide either markdown or workouts array");
      }

      if (itemsToImport.length === 0) {
        return "No valid workouts found in input.";
      }

      if (dryRun) {
        const previews = itemsToImport.map((item) => {
          const parsed = parseWorkoutNote(item.rawNote, userUnit);
          return `• ${item.date} (${parsed.title || item.title}): ${parsed.exercises.length} exercises, ${parsed.exercises.reduce((acc, e) => acc + e.sets.length, 0)} sets`;
        });
        return `[DRY RUN PREVIEW] Found ${itemsToImport.length} workouts:\n${previews.join("\n")}\n\nCall import_workouts with dryRun: false to commit.`;
      }

      const results = await prisma.$transaction(async (tx) => {
        let createdCount = 0;
        let updatedCount = 0;

        for (const item of itemsToImport) {
          const { start, end } = dayBoundsInTz(item.date, tz);
          const workoutUtcDate = zonedWallToUtc(item.date, "12:00:00.000", tz);
          const parsedWorkout = parseWorkoutNote(item.rawNote, userUnit);
          const resolvedTitle =
            parsedWorkout.title && parsedWorkout.title !== "Workout"
              ? parsedWorkout.title
              : item.title || "Workout";

          let existing = await tx.workout.findFirst({
            where: { userId, date: { gte: start, lt: end } },
          });

          if (!existing) {
            existing = await tx.workout.create({
              data: {
                userId,
                date: workoutUtcDate,
                title: resolvedTitle,
                rawNote: item.rawNote,
                notes: parsedWorkout.notes,
                source: "mcp-import",
              },
            });
            createdCount++;
          } else {
            if (overwrite === false) continue;
            await tx.workoutExercise.deleteMany({ where: { workoutId: existing.id } });
            existing = await tx.workout.update({
              where: { id: existing.id },
              data: {
                title: resolvedTitle,
                rawNote: item.rawNote,
                notes: parsedWorkout.notes,
                source: "mcp-import",
                updatedAt: new Date(),
              },
            });
            updatedCount++;
          }

          for (let i = 0; i < parsedWorkout.exercises.length; i++) {
            const parsedEx = parsedWorkout.exercises[i];
            const exercise = await tx.exercise.upsert({
              where: { userId_normalized: { userId, normalized: parsedEx.normalized } },
              update: { name: parsedEx.name },
              create: { userId, name: parsedEx.name, normalized: parsedEx.normalized },
            });

            const we = await tx.workoutExercise.create({
              data: {
                workoutId: existing.id,
                exerciseId: exercise.id,
                order: i,
                notes: parsedEx.notes,
              },
            });

            if (parsedEx.sets.length > 0) {
              await tx.workoutSet.createMany({
                data: parsedEx.sets.map((s) => ({
                  workoutExerciseId: we.id,
                  setNumber: s.setNumber,
                  weight: toKg(s.weight, s.unit),
                  unit: s.unit,
                  reps: s.reps,
                  isWarmup: s.isWarmup,
                  isBodyweight: s.isBodyweight,
                  rpe: s.rpe,
                })),
              });
            }
          }
        }

        return { createdCount, updatedCount };
      });

      return `Successfully imported ${results.createdCount + results.updatedCount} workouts (${results.createdCount} new, ${results.updatedCount} updated).`;
    }

    case "export_workouts": {
      const { format, startDate, endDate } = parsed.data as z.infer<typeof exportWorkoutsSchema>;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { weightUnit: true } });
      const userUnit: WeightUnit = isWeightUnit(user?.weightUnit) ? (user!.weightUnit as WeightUnit) : "kg";

      const dateFilter: Record<string, unknown> = {};
      if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) dateFilter.lte = new Date(`${endDate}T23:59:59.999Z`);

      const workouts = await prisma.workout.findMany({
        where: {
          userId,
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: {
              exercise: true,
              sets: { orderBy: { setNumber: "asc" } },
            },
          },
        },
        orderBy: { date: "desc" },
      });

      if (workouts.length === 0) {
        return "No workouts found to export.";
      }

      if (format === "markdown") {
        return generateObsidianExport(
          workouts.map((w) => ({
            date: w.date.toISOString().slice(0, 10),
            title: w.title,
            rawNote: w.rawNote,
          })),
        );
      }

      return JSON.stringify(
        workouts.map((w) => ({
          date: w.date.toISOString().slice(0, 10),
          title: w.title,
          rawNote: w.rawNote,
          exercises: w.exercises.map((we) => ({
            name: we.exercise.name,
            sets: we.sets.map((s) => ({
              set: s.setNumber,
              weight: fromKg(s.weight, userUnit),
              unit: userUnit,
              reps: s.reps,
            })),
          })),
        })),
        null,
        2,
      );
    }

    case "get_workout_summary": {
      const { days } = parsed.data as z.infer<typeof workoutSummarySchema>;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { weightUnit: true } });
      const userUnit: WeightUnit = isWeightUnit(user?.weightUnit) ? (user!.weightUnit as WeightUnit) : "kg";

      const summary = await getWorkoutMacroSummary(userId, days, userUnit);

      const lines: string[] = [
        `# Workout Analytics (Past ${days} Days)`,
        `• Total Sessions: ${summary.totalWorkouts}`,
        `• Total Tonnage Lifted: ${summary.totalVolume.toLocaleString()} ${userUnit}`,
        `• Total Sets Logged: ${summary.totalSets} (avg ${summary.totalWorkouts > 0 ? Math.round(summary.totalSets / summary.totalWorkouts) : 0} sets/session)`,
        `• Total Reps: ${summary.totalReps.toLocaleString()}`,
        "",
        "Muscle Group Distribution:",
      ];

      for (const [group, info] of Object.entries(summary.muscleGroups)) {
        lines.push(`• ${group}: ${info.sets} sets (${info.percentage}%)`);
      }

      if (summary.recentWorkouts.length > 0) {
        lines.push("", "Recent Sessions:");
        for (const rw of summary.recentWorkouts.slice(0, 5)) {
          lines.push(`• ${rw.date} · ${rw.title}: ${rw.exercisesCount} exercises, ${rw.setsCount} sets, ${rw.volume.toLocaleString()} ${userUnit}`);
        }
      }

      return lines.join("\n");
    }

    default:

      throw new Error(`Unknown tool: ${name}`);
  }
}

const RESOURCES = [
  {
    uri: "diet://today/summary",
    name: "Today's Nutrition Summary",
    description: "Daily calorie & macro totals for today, compared against daily goals",
    mimeType: "application/json",
  },
  {
    uri: "diet://today/entries",
    name: "Today's Food Entries",
    description: "All meals and food entries logged for today in chronological order",
    mimeType: "application/json",
  },
  {
    uri: "diet://catalog/products",
    name: "Saved Product Catalog",
    description: "User's permanent library of scanned nutrition labels and barcodes",
    mimeType: "application/json",
  },
  {
    uri: "diet://user/goals",
    name: "Nutrition Goals & Profile",
    description: "Daily calorie and macro targets, weight unit, and timezone",
    mimeType: "application/json",
  },
  {
    uri: "diet://weight/recent",
    name: "Recent Weight Logs",
    description: "Recent body weight entries (last 30 days)",
    mimeType: "application/json",
  },
];

async function readResource(
  uri: string,
  userId: string,
  tz: string,
): Promise<{ uri: string; mimeType: string; text: string }> {
  switch (uri) {
    case "diet://today/summary": {
      const today = todayInTz(tz);
      const { start, end } = dayBoundsInTz(today, tz);
      const [entries, user] = await Promise.all([
        prisma.foodEntry.findMany({ where: { userId, consumedAt: { gte: start, lt: end } } }),
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            dailyCalories: true,
            dailyProtein: true,
            dailyCarbs: true,
            dailyFat: true,
            dailyFiber: true,
            dailySugar: true,
            dailySodium: true,
            timezone: true,
            weightUnit: true,
          },
        }),
      ]);

      const totals = entries.reduce(
        (acc, e) => ({
          calories: acc.calories + e.calories,
          protein: Math.round((acc.protein + e.protein) * 10) / 10,
          carbs: Math.round((acc.carbs + e.carbs) * 10) / 10,
          fat: Math.round((acc.fat + e.fat) * 10) / 10,
          fiber: Math.round((acc.fiber + e.fiber) * 10) / 10,
          sugar: Math.round((acc.sugar + e.sugar) * 10) / 10,
          sodium: Math.round(acc.sodium + e.sodium),
          count: acc.count + 1,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, count: 0 },
      );

      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            date: today,
            timezone: tz,
            totals,
            goals: {
              calories: user?.dailyCalories ?? null,
              protein: user?.dailyProtein ?? null,
              carbs: user?.dailyCarbs ?? null,
              fat: user?.dailyFat ?? null,
              fiber: user?.dailyFiber ?? null,
              sugar: user?.dailySugar ?? null,
              sodium: user?.dailySodium ?? null,
            },
            remaining: user?.dailyCalories
              ? {
                  calories: Math.max(0, user.dailyCalories - totals.calories),
                  protein: user.dailyProtein ? Math.max(0, user.dailyProtein - totals.protein) : null,
                  carbs: user.dailyCarbs ? Math.max(0, user.dailyCarbs - totals.carbs) : null,
                  fat: user.dailyFat ? Math.max(0, user.dailyFat - totals.fat) : null,
                }
              : null,
          },
          null,
          2,
        ),
      };
    }

    case "diet://today/entries": {
      const today = todayInTz(tz);
      const { start, end } = dayBoundsInTz(today, tz);
      const entries = await prisma.foodEntry.findMany({
        where: { userId, consumedAt: { gte: start, lt: end } },
        orderBy: { consumedAt: "asc" },
      });

      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            date: today,
            count: entries.length,
            entries: entries.map((e) => ({
              id: e.id,
              name: e.name,
              mealType: e.mealType,
              calories: e.calories,
              protein: e.protein,
              carbs: e.carbs,
              fat: e.fat,
              fiber: e.fiber,
              sugar: e.sugar,
              sodium: e.sodium,
              quantity: e.quantity,
              quantityUnit: e.quantityUnit,
              productId: e.productId,
              source: e.source,
              consumedAt: e.consumedAt.toISOString(),
            })),
          },
          null,
          2,
        ),
      };
    }

    case "diet://catalog/products": {
      const products = await prisma.product.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });

      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            total: products.length,
            products: products.map((p) => ({
              id: p.id,
              name: p.name,
              brand: p.brand,
              barcode: p.barcode,
              basis: p.basis,
              calories: p.calories,
              protein: p.protein,
              carbs: p.carbs,
              fat: p.fat,
              fiber: p.fiber,
              sugar: p.sugar,
              sodium: p.sodium,
              servingSize: p.servingSize,
              servingUnit: p.servingUnit,
              source: p.source,
            })),
          },
          null,
          2,
        ),
      };
    }

    case "diet://user/goals": {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          dailyCalories: true,
          dailyProtein: true,
          dailyCarbs: true,
          dailyFat: true,
          dailyFiber: true,
          dailySugar: true,
          dailySodium: true,
          weightUnit: true,
          timezone: true,
          sex: true,
          birthYear: true,
          heightCm: true,
        },
      });

      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(user ?? {}, null, 2),
      };
    }

    case "diet://weight/recent": {
      const logs = await prisma.weightLog.findMany({
        where: { userId },
        orderBy: { loggedAt: "desc" },
        take: 30,
      });

      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            count: logs.length,
            logs: logs.map((l) => ({
              id: l.id,
              weightKg: l.weight,
              unit: l.unit,
              loggedAt: l.loggedAt.toISOString(),
            })),
          },
          null,
          2,
        ),
      };
    }

    default:
      throw new Error(`Unknown resource URI: ${uri}`);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: {
    jsonrpc: string;
    method: string;
    params?: Record<string, unknown>;
    id?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { method, params, id } = body;

  // Notifications are fire-and-forget — no response body required.
  if (method.startsWith("notifications/")) {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  // initialize and tools/list need no auth — MCP clients discover tools before
  // the user has a chance to configure the Authorization header.
  if (method === "initialize") {
    const clientVersion =
      (params?.protocolVersion as string | undefined) ?? "2024-11-05";
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: clientVersion,
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "diet-tracker", version: "1.0.0" },
          instructions: `Diet Tracker MCP Server — Instructions for AI Assistants:

1. AUTOMATICALLY SAVE SCANNED NUTRITION TABLES & LABELS:
- Whenever the user photos, shares, or provides a nutrition facts table or product label:
  -> ALWAYS call 'save_product' to save it to their permanent catalog first!
  -> Provide the values per 100g or 100ml basis. Include barcode, brand, and serving size whenever visible.
  -> Do NOT just log a one-off meal entry. Saving the product ensures it is permanently saved in the user's library and available across all devices.
  -> After saving, if the user consumed a portion, call 'log_meal' with the returned 'productId' and the quantity eaten.

2. BARCODE SCANNING & LOOKUP:
- When a barcode is visible in a photo or provided as digits:
  -> Call 'lookup_barcode' immediately.
  -> If found on Open Food Facts, 'lookup_barcode' automatically saves the product into the user's catalog and returns its productId.
  -> If the barcode is not found on Open Food Facts, read the nutrition table from the photo/user and call 'save_product' including the 'barcode' field.

3. LOGGING MEALS:
- For MULTI-ITEM MEALS (full plate, combo, multiple dishes, e.g. 150g chicken breast + 200g rice + 10g olive oil):
  -> ALWAYS call 'log_meal_items' to log all items in ONE tool call!
- For single items, call 'log_meal'.
- Whenever possible, log using 'productId' + 'quantity' + 'unit' (e.g. quantity: 150, unit: "g") with 'mealType'. The server calculates the exact macros automatically from the saved product.
- If logging homemade, restaurant, or unpackaged food without a product label, provide 'name', 'calories', and estimated macros directly.

4. USER FEEDBACK:
- After saving a product and/or logging, give the user a clear, friendly confirmation stating:
  a) The product name and that it was saved to their permanent catalog.
  b) The meal type, quantity eaten, and resulting calories + macros.

5. REAL-TIME CONTEXT RESOURCES:
- You have direct read access to real-time diet resources:
  • diet://today/summary — today's calories, macros, goals, and remaining budget
  • diet://today/entries — all meals and items logged today
  • diet://catalog/products — the user's permanent catalog of saved products
  • diet://user/goals — daily targets (calories, protein, carbs, fat, fiber, etc.)
  • diet://weight/recent — body weight logs from the last 30 days`,
        },
      },
      { headers: CORS },
    );
  }

  if (method === "tools/list") {
    return NextResponse.json(
      { jsonrpc: "2.0", id: id ?? null, result: { tools: TOOLS } },
      { headers: CORS },
    );
  }

  if (method === "resources/list") {
    return NextResponse.json(
      { jsonrpc: "2.0", id: id ?? null, result: { resources: RESOURCES } },
      { headers: CORS },
    );
  }

  // tools/call and resources/read require an API key — accepted via ?key= query param or
  // Authorization: Bearer header.
  if (method === "tools/call" || method === "resources/read") {
    const keyFromQuery = req.nextUrl.searchParams.get("key");
    const authHeader = req.headers.get("authorization");
    const rawKey =
      keyFromQuery ??
      (authHeader?.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : null);

    let userId: string | null = null;
    let userTz = "UTC";
    if (rawKey) {
      const user = await prisma.user.findUnique({
        where: { apiKey: rawKey },
        select: { id: true, timezone: true },
      });
      if (user) {
        userId = user.id;
        userTz = user.timezone;
      }
    }

    if (!userId) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: id ?? null,
          error: {
            code: -32001,
            message:
              "Unauthorized — use the connector URL from your dashboard (it includes your key)",
          },
        },
        { headers: CORS },
      );
    }

    if (method === "resources/read") {
      const { uri } = (params ?? {}) as { uri?: string };
      if (!uri) {
        return rpcError(id, -32602, "Missing uri parameter for resources/read");
      }
      try {
        const content = await readResource(uri, userId, userTz);
        return NextResponse.json(
          { jsonrpc: "2.0", id: id ?? null, result: { contents: [content] } },
          { headers: CORS },
        );
      } catch (e) {
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            id: id ?? null,
            error: {
              code: -32002,
              message: e instanceof Error ? e.message : "Resource read failed",
            },
          },
          { headers: CORS },
        );
      }
    }

    const { name, arguments: args = {} } = (params ?? {}) as {
      name: string;
      arguments?: Record<string, unknown>;
    };
    try {
      const text = await callTool(name, args, userId, userTz);
      return NextResponse.json(
        { jsonrpc: "2.0", id: id ?? null, result: { content: [{ type: "text", text }] } },
        { headers: CORS },
      );
    } catch (e) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            content: [
              {
                type: "text",
                text: e instanceof Error ? e.message : "Tool execution failed",
              },
            ],
            isError: true,
          },
        },
        { headers: CORS },
      );
    }
  }

  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32601, message: `Method not found: ${method}` },
    },
    { headers: CORS },
  );
}

export async function GET() {
  return NextResponse.json(
    {
      name: "diet-tracker",
      version: "1.0.0",
      protocol: "MCP 2024-11-05",
      description: "Diet Tracker MCP Server for AI assistants (Claude, Cursor, Windsurf, ChatGPT, etc.)",
    },
    { headers: CORS },
  );
}
