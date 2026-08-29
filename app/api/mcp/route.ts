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
    name: "save_product",
    description:
      "Save a product's nutrition label to the user's permanent catalog, with values per 100g/100ml. ALWAYS call this when you read a nutrition or macro table from a photo — it means the user never has to photograph that product again. Re-saving the same barcode (or same name+brand) updates the existing entry instead of duplicating it. After saving, use log_meal with the returned productId and the grams eaten.",
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
      "Log a food entry. Preferred: pass productId (from save_product/search_products) plus quantity and unit — the macros are then computed from the stored label, so you do not need to do any arithmetic. Otherwise pass name and calories directly, estimating macros from the food name.",
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
];

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}

const MACRO_KEYS = ["protein", "carbs", "fat", "fiber", "sugar", "sodium"] as const;

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

      let entryData: Record<string, unknown>;
      let provenance = "";

      if (a.productId) {
        const p = await prisma.product.findFirst({
          where: { id: a.productId, userId },
        });
        if (!p) throw new Error(`Product ${a.productId} not found`);

        // What the caller asked for, resolved into the product's own base unit
        // (grams for a 100g product, millilitres for a 100ml one). Defaults to
        // one serving when the label defines it, else 100 of the base unit.
        const basis = p.basis as Basis;
        const serving =
          p.servingSize != null ? { size: p.servingSize, unit: p.servingUnit as ServingUnit } : null;
        // An explicit unit wins. Failing that, a bare `quantity` — and the
        // deprecated `grams`, which always meant the base unit — are read in the
        // base unit. Only when no amount is given at all does a declared serving
        // become the default, because that is the sane "one of these" reading.
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
          ...Object.fromEntries(MACRO_KEYS.map((k) => [k, a[k]])),
        };
      }

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

    default:
      throw new Error(`Unknown tool: ${name}`);
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

  // initialize and tools/list need no auth — Claude.ai discovers tools before
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
          capabilities: { tools: {} },
          serverInfo: { name: "diet-tracker", version: "1.0.0" },
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

  // tools/call requires an API key — accepted via ?key= query param or
  // Authorization: Bearer header (query param is easier with Claude.ai connectors).
  if (method === "tools/call") {
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
    { name: "diet-tracker", version: "1.0.0", protocol: "MCP 2024-11-05" },
    { headers: CORS },
  );
}
