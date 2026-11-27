import { z } from "zod";
import { isValidCalendarDate, zonedWallToUtc } from "../time";
import { QUANTITY_UNITS, SERVING_UNITS, WEIGHT_UNITS } from "../units";
import { MEAL_TYPES } from "../validation";
import { ToolError } from "./errors";

export const MEALS = MEAL_TYPES;

const num = (max = 1000000) =>
  z.coerce.number().finite("must be a finite number").min(0).max(max);
const intNum = (max = 100000) =>
  z.coerce.number().finite("must be a finite number").int("must be a whole number").min(0).max(max);
const posNum = (max = 100000) =>
  z.coerce.number().finite("must be a finite number").positive("must be greater than 0").max(max);
const optNum = (max = 1000000) => num(max).optional().default(0);

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine(isValidCalendarDate, "Date must be a valid calendar date");

const OFFSET_LESS_ISO = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/;

/**
 * Resolve a consumedAt/loggedAt argument in the user's timezone.
 * - Bare YYYY-MM-DD anchors at local noon in `tz`.
 * - Offset-less YYYY-MM-DDTHH:mm(:ss) interprets wall time in `tz`.
 * - Full ISO timestamps with an explicit offset pass straight through.
 */
export function resolveConsumedAt(value: string | undefined, tz: string): Date {
  if (!value) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!isValidCalendarDate(value)) {
      throw new ToolError(`Invalid calendar date: ${value}`);
    }
    return zonedWallToUtc(value, "12:00:00.000", tz);
  }
  const wallMatch = OFFSET_LESS_ISO.exec(value.trim());
  if (wallMatch) {
    const [, datePart, rawTime] = wallMatch;
    if (!isValidCalendarDate(datePart)) {
      throw new ToolError(`Invalid calendar date: ${value}`);
    }
    const timePart =
      rawTime.length === 5
        ? `${rawTime}:00.000`
        : rawTime.length === 8
          ? `${rawTime}.000`
          : rawTime;
    const resolved = zonedWallToUtc(datePart, timePart, tz);
    if (Number.isNaN(resolved.getTime())) {
      throw new ToolError(`Invalid timestamp: ${value}`);
    }
    return resolved;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ToolError(`Invalid timestamp: ${value}`);
  }
  return d;
}

export const mealItemSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    calories: intNum(100000).optional(),
    protein: optNum(),
    carbs: optNum(),
    fat: optNum(),
    fiber: optNum(),
    sugar: optNum(),
    sodium: optNum(),
    productId: z.string().min(1).optional(),
    quantity: posNum(100000).optional(),
    unit: z.enum(QUANTITY_UNITS).optional(),
    grams: posNum(100000).optional(),
  })
  .refine((a) => a.productId != null || (a.name != null && a.calories != null), {
    message: "Provide either productId (+ quantity) or both name and calories",
  });

export const logMealSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    calories: intNum(100000).optional(),
    protein: optNum(),
    carbs: optNum(),
    fat: optNum(),
    fiber: optNum(),
    sugar: optNum(),
    sodium: optNum(),
    mealType: z.enum(MEALS),
    productId: z.string().min(1).optional(),
    quantity: posNum(100000).optional(),
    unit: z.enum(QUANTITY_UNITS).optional(),
    /** @deprecated Still accepted; means quantity in the product's base unit. */
    grams: posNum(100000).optional(),
    consumedAt: z.string().min(1).optional(),
  })
  .refine((a) => a.productId != null || (a.name != null && a.calories != null), {
    message: "Provide either productId (+ quantity) or both name and calories",
  });

export const logMealItemsSchema = z.object({
  mealType: z.enum(MEALS),
  consumedAt: z.string().min(1).optional(),
  items: z.array(mealItemSchema).min(1).max(30),
});

export const productArgsSchema = z.object({
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
  servingSize: posNum(100000).nullish(),
  servingUnit: z.enum(SERVING_UNITS).nullish(),
  /** @deprecated Still accepted; read as the product's own base unit. */
  servingGrams: posNum(100000).nullish(),
});

export const dateArgSchema = z.object({ date: calendarDate.optional() });
export const idArgSchema = z.object({ id: z.string().min(1) });
export const searchArgSchema = z.object({ query: z.string().max(200).optional() });

export const goalsArgsSchema = z.object({
  dailyCalories: intNum(100000).nullish(),
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
  heightCm: z.coerce.number().finite().min(50).max(300).nullish(),
});

export const weightArgsSchema = z.object({
  weight: z.coerce.number().finite("must be a finite number").positive("Weight must be positive").max(1000),
  unit: z.enum(WEIGHT_UNITS).optional(),
  loggedAt: z.string().min(1).optional(),
});

export const favoriteArgsSchema = z.object({
  name: z.string().min(1).max(200),
  calories: intNum(100000),
  protein: optNum(),
  carbs: optNum(),
  fat: optNum(),
  fiber: optNum(),
  sugar: optNum(),
  sodium: optNum(),
  mealType: z.enum(MEALS).optional(),
});

export const barcodeArgSchema = z.object({ barcode: z.string().min(1).max(64) });

export const logWorkoutSchema = z.object({
  date: calendarDate.optional(),
  title: z.string().max(200).optional(),
  note: z.string().min(1, "Workout note text is required").max(50_000),
});

export const getWorkoutSchema = z.object({
  date: calendarDate.optional(),
});

export const exerciseHistorySchema = z.object({
  exercise: z.string().min(1, "Exercise name is required").max(200),
});

export const suggestNextWorkoutSchema = z.object({
  routine: z.string().max(200).optional().default("Push Day"),
});

export const importWorkoutsSchema = z.object({
  markdown: z.string().max(500_000).optional(),
  workouts: z
    .array(
      z.object({
        date: calendarDate,
        title: z.string().max(200).optional(),
        note: z.string().min(1).max(50_000),
      }),
    )
    .max(365)
    .optional(),
  dryRun: z.boolean().optional().default(false),
  overwrite: z.boolean().optional().default(true),
});

export const exportWorkoutsSchema = z.object({
  format: z.enum(["markdown", "json"]).optional().default("markdown"),
  startDate: calendarDate.optional(),
  endDate: calendarDate.optional(),
});

export const workoutSummarySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

export const ARG_SCHEMAS = new Map<string, z.ZodTypeAny>([
  ["log_meal", logMealSchema],
  ["get_summary", dateArgSchema],
  ["list_entries", dateArgSchema],
  ["delete_entry", idArgSchema],
  ["set_goals", goalsArgsSchema],
  ["log_weight", weightArgsSchema],
  ["list_weight", z.object({}).passthrough()],
  ["list_favorites", z.object({}).passthrough()],
  ["save_favorite", favoriteArgsSchema],
  ["save_product", productArgsSchema],
  ["search_products", searchArgSchema],
  ["delete_product", idArgSchema],
  ["lookup_barcode", barcodeArgSchema],
  ["log_meal_items", logMealItemsSchema],
  ["log_workout", logWorkoutSchema],
  ["get_workout", getWorkoutSchema],
  ["get_exercise_history", exerciseHistorySchema],
  ["suggest_next_workout", suggestNextWorkoutSchema],
  ["import_workouts", importWorkoutsSchema],
  ["export_workouts", exportWorkoutsSchema],
  ["get_workout_summary", workoutSummarySchema],
]);

const nutrientProps = {
  protein: { type: "number", minimum: 0, description: "grams" },
  carbs: { type: "number", minimum: 0, description: "grams" },
  fat: { type: "number", minimum: 0, description: "grams" },
  fiber: { type: "number", minimum: 0, description: "grams" },
  sugar: { type: "number", minimum: 0, description: "grams" },
  sodium: { type: "number", minimum: 0, description: "milligrams" },
};

export const TOOLS = [
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
        servingSize: { type: "number", exclusiveMinimum: 0, description: "One serving = N of servingUnit, if the label states it" },
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
      "Search the user's saved product catalog by name or brand. Call this BEFORE asking the user to photograph a label — the product may already be saved. Returns productIds for use with log_meal (up to 50 matches).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or brand substring. Omit to list recent saved products (up to 50)." },
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
        quantity: { type: "number", exclusiveMinimum: 0, description: "Amount eaten, in `unit`. Used with productId. Defaults to one serving, else 100 of the product's base unit." },
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
          minItems: 1,
          maxItems: 30,
          description: "List of foods eaten in this meal",
          items: {
            type: "object",
            properties: {
              productId: { type: "string", description: "Saved product ID if from catalog" },
              quantity: { type: "number", exclusiveMinimum: 0, description: "Amount eaten in unit" },
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
    description: "Set daily calorie/macro targets and profile fields. Pass null to clear a goal.",
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
        sex: { type: ["string", "null"], enum: ["male", "female", null], description: "Biological sex for TDEE estimate" },
        birthYear: { type: ["integer", "null"], minimum: 1900, maximum: 2100, description: "Birth year for TDEE estimate" },
        heightCm: { type: ["number", "null"], minimum: 50, maximum: 300, description: "Height in cm for TDEE estimate" },
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
          description:
            "Obsidian-style markdown: an exercise name on its own line, followed by '- ' set lines. Set syntax: " +
            "'80kg x 8' (weight x reps), 'BW x 10' (bodyweight), '+15kg x 6' (weighted bodyweight), '-10kg x 8' (assisted), " +
            "'(warmup)' to flag a warmup set, '@8.5' for RPE, and comma shorthand for several sets at once — either " +
            "'Exercise: 80kg x 8, 8, 7' inline, or a bare '- 80kg x 8, 80kg x 8' line. " +
            "Use '// comment' for freeform notes — a set's own '- 80kg x 8 // prev: 75kg x8', a standalone '// felt heavy today' under an exercise, or a workout-level note before the first exercise (or under a trailing '## Notes' heading). Comments are never parsed as sets or exercise names, so they're the safe way to record reference info like previous weight/reps. " +
            "Example: 'Bench Press\\n- 80kg x 8\\n- 85kg x 6 // matched last week's top set\\n\\nIncline DB\\n- 30kg x 10'.",
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
    description: "Bulk import multiple workouts from Obsidian markdown text (e.g. journal with dated headings like '## 2026-09-08 Push Day') or a structured workouts array. Automatically extracts exercises, weights, and sets. RECOMMENDED: call once with dryRun: true first to preview the parsed workout/exercise/set counts before committing.",
    inputSchema: {
      type: "object",
      properties: {
        markdown: {
          type: "string",
          description:
            "Multi-day Obsidian notes markdown string. Supports '// comment' lines/trailing comments for freeform notes (e.g. previous weight/reps) without them being misread as sets or exercises — see log_workout's note field for the full syntax.",
        },
        workouts: {
          type: "array",
          maxItems: 365,
          description: "Structured array of workout objects",
          items: {
            type: "object",
            required: ["date", "note"],
            properties: {
              date: { type: "string", description: "YYYY-MM-DD" },
              title: { type: "string" },
              note: {
                type: "string",
                description: "Same Obsidian markdown format and '// comment' syntax as log_workout's note field.",
              },
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
