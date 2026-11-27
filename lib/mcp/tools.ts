import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import {
  dayBoundsInTz,
  isValidTimeZone,
  localDateInTz,
  todayInTz,
} from "../time";
import {
  baseUnitFor,
  BODY_WEIGHT_DECIMALS,
  formatQuantity,
  fromKg,
  isWeightUnit,
  toBase,
  toKg,
  unitLabel,
  type Basis,
  type QuantityUnit,
  type ServingUnit,
  type WeightUnit,
} from "../units";
import {
  formatWorkoutNote,
  generateObsidianExport,
  normalizeExerciseName,
  parseMultiWorkoutMarkdown,
  parseWorkoutNote,
} from "../workout-parser";
import {
  getExerciseFullHistory,
  getExerciseSummariesBatch,
  getWorkoutMacroSummary,
} from "../workout-stats";
import { WORKOUT_TEMPLATES } from "../workout-templates";
import { lookupOrFetchBarcode, ProductServiceError, upsertProduct } from "../services/products";
import { formatSetSummary, upsertWorkoutForDay } from "../services/workouts";
import { ToolError } from "./errors";
import {
  ARG_SCHEMAS,
  barcodeArgSchema,
  dateArgSchema,
  exerciseHistorySchema,
  exportWorkoutsSchema,
  favoriteArgsSchema,
  getWorkoutSchema,
  goalsArgsSchema,
  idArgSchema,
  importWorkoutsSchema,
  logMealItemsSchema,
  logMealSchema,
  logWorkoutSchema,
  mealItemSchema,
  productArgsSchema,
  resolveConsumedAt,
  searchArgSchema,
  suggestNextWorkoutSchema,
  weightArgsSchema,
  workoutSummarySchema,
} from "./schemas";

export interface McpUser {
  id: string;
  timezone: string;
  weightUnit: string;
}

async function resolveMealItemEntry(
  a: z.infer<typeof mealItemSchema>,
  userId: string,
): Promise<{
  entryData: Omit<Prisma.FoodEntryUncheckedCreateInput, "userId" | "mealType" | "source" | "consumedAt">;
  provenance: string;
}> {
  if (a.productId) {
    const p = await prisma.product.findFirst({
      where: { id: a.productId, userId },
    });
    if (!p) throw new ToolError(`Product ${a.productId} not found`);

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
      throw new ToolError(
        `Cannot log ${formatQuantity(asked, askedUnit)} of "${p.name}", which is measured per ${p.basis}. ` +
          `Use ${baseUnitFor(basis)}${serving ? " or serving" : ""}.`,
      );
    }
    const f = base / 100;
    return {
      entryData: {
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
      },
      provenance:
        ` — ${formatQuantity(asked, askedUnit)}` +
        (askedUnit === "serving" ? ` (${base}${baseUnitFor(basis)})` : "") +
        " of saved product",
    };
  }

  const manualQty = a.quantity ?? a.grams;
  return {
    entryData: {
      name: a.name!,
      calories: Math.round(a.calories!),
      protein: a.protein ?? 0,
      carbs: a.carbs ?? 0,
      fat: a.fat ?? 0,
      fiber: a.fiber ?? 0,
      sugar: a.sugar ?? 0,
      sodium: a.sodium ?? 0,
      ...(manualQty != null ? { quantity: manualQty, quantityUnit: a.unit ?? "g" } : {}),
    },
    provenance: "",
  };
}

export async function callTool(
  name: string,
  rawArgs: Record<string, unknown>,
  user: McpUser,
): Promise<string> {
  const schema = ARG_SCHEMAS.get(name);
  if (!schema) throw new ToolError(`Unknown tool: ${name}`);

  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new ToolError(`Invalid arguments for ${name} — ${detail}`);
  }

  const userId = user.id;
  const tz = user.timezone;
  const userUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  switch (name) {
    case "lookup_barcode": {
      const { barcode } = parsed.data as z.infer<typeof barcodeArgSchema>;
      const code = barcode.trim();
      if (!/^\d{6,14}$/.test(code)) {
        throw new ToolError(`Invalid barcode format: "${code}". Expected 6 to 14 numeric digits.`);
      }

      const result = await lookupOrFetchBarcode(userId, code, { autoSave: true });
      if (result.source === "saved") {
        const existing = result.product;
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

      if (result.source === "none") {
        if (result.fetchFailed) {
          return (
            `Barcode lookup for ${code} timed out or could not reach Open Food Facts. ` +
            `Please provide or read the nutrition label and call 'save_product' to save it manually.`
          );
        }
        return `Barcode ${code} not found in catalog or Open Food Facts. Please ask the user for a photo of the nutrition label, read the values, and call 'save_product' to save it.`;
      }

      if (result.savedProduct) {
        const saved = result.savedProduct;
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
      }

      const off = result.product;
      return (
        `Found "${off.name}" on Open Food Facts, but nutrition values were empty so it was not auto-saved. ` +
        `Please read the nutrition label and call 'save_product' with the exact numbers.`
      );
    }

    case "save_product": {
      const a = parsed.data as z.infer<typeof productArgsSchema>;
      try {
        const { product: p, created } = await upsertProduct(userId, a, "mcp");
        return (
          `${created ? "Saved" : "Updated"} product "${p.name}"${p.brand ? ` (${p.brand})` : ""} — ` +
          `per ${p.basis}: ${p.calories} kcal · P ${p.protein}g · C ${p.carbs}g · F ${p.fat}g` +
          `${p.servingSize ? ` · serving ${p.servingSize}${unitLabel(p.servingUnit as ServingUnit)}` : ""}\n` +
          `productId: ${p.id} — log it with log_meal { productId, quantity, unit, mealType }.`
        );
      } catch (err) {
        if (err instanceof ProductServiceError) throw new ToolError(err.message);
        throw err;
      }
    }

    case "search_products": {
      const { query } = parsed.data as z.infer<typeof searchArgSchema>;
      const rows = await prisma.product.findMany({
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
        take: 51,
      });
      const truncated = rows.length > 50;
      const products = truncated ? rows.slice(0, 50) : rows;
      if (products.length === 0) {
        return query
          ? `No saved products match "${query}". Ask for a photo of the label, then call save_product.`
          : "No products saved yet. Photograph a nutrition label and call save_product.";
      }
      const list = products
        .map(
          (p) =>
            `[${p.id}] ${p.name}${p.brand ? ` — ${p.brand}` : ""} · per ${p.basis}: ` +
            `${p.calories} kcal, P${p.protein} C${p.carbs} F${p.fat}` +
            `${p.servingSize ? ` · serving ${p.servingSize}${unitLabel(p.servingUnit as ServingUnit)}` : ""}`,
        )
        .join("\n");
      return truncated
        ? `${list}\n\n(Showing first 50 matches — pass a more specific query to narrow down.)`
        : list;
    }

    case "delete_product": {
      const { id } = parsed.data as z.infer<typeof idArgSchema>;
      const p = await prisma.product.findFirst({ where: { id, userId }, select: { id: true, name: true } });
      if (!p) throw new ToolError(`Product ${id} not found`);
      await prisma.product.deleteMany({ where: { id: p.id, userId } });
      return `Deleted product "${p.name}"`;
    }

    case "log_meal": {
      const a = parsed.data as z.infer<typeof logMealSchema>;
      const consumedAt = resolveConsumedAt(a.consumedAt, tz);
      const { entryData, provenance } = await resolveMealItemEntry(a, userId);

      const entry = await prisma.foodEntry.create({
        data: { userId, ...entryData, source: "mcp", mealType: a.mealType, consumedAt },
      });

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

      const createdEntries = await prisma.$transaction(async (tx) => {
        const out = [];
        for (const { entryData } of resolved) {
          out.push(
            await tx.foodEntry.create({
              data: { userId, ...entryData, source: "mcp", mealType: a.mealType, consumedAt },
            }),
          );
        }
        return out;
      });

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
      const [entries, goals] = await Promise.all([
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
      const line = (label: string, val: number, goal: number | null, unit: string) => {
        if (goal == null) return ` ${label}: ${r(val)}${unit}`;
        if (goal <= 0) return ` ${label}: ${r(val)}${unit} / ${goal}${unit}`;
        return ` ${label}: ${r(val)}${unit} / ${goal}${unit} (${Math.round((val / goal) * 100)}%)`;
      };
      return (
        `Summary for ${date} (${t.count} entr${t.count === 1 ? "y" : "ies"})\n` +
        line("Calories", t.calories, goals?.dailyCalories ?? null, " kcal") + "\n" +
        line("Protein", t.protein, goals?.dailyProtein ?? null, "g") + "\n" +
        line("Carbs", t.carbs, goals?.dailyCarbs ?? null, "g") + "\n" +
        line("Fat", t.fat, goals?.dailyFat ?? null, "g") + "\n" +
        line("Fiber", t.fiber, goals?.dailyFiber ?? null, "g") + "\n" +
        line("Sugar", t.sugar, goals?.dailySugar ?? null, "g") + "\n" +
        line("Sodium", t.sodium, goals?.dailySodium ?? null, "mg")
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
      const entry = await prisma.foodEntry.findFirst({ where: { id, userId }, select: { id: true, name: true } });
      if (!entry) throw new ToolError(`Entry ${id} not found`);
      await prisma.foodEntry.deleteMany({ where: { id: entry.id, userId } });
      return `Deleted "${entry.name}"`;
    }

    case "set_goals": {
      const a = parsed.data as z.infer<typeof goalsArgsSchema>;
      if (a.timezone != null && !isValidTimeZone(a.timezone)) {
        throw new ToolError(`Invalid timezone: ${a.timezone}`);
      }
      const data = Object.fromEntries(
        Object.entries(a).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(data).length === 0) throw new ToolError("No goal fields provided");
      await prisma.user.update({ where: { id: userId }, data });
      return `Goals updated — ${Object.entries(data).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    }

    case "log_weight": {
      const a = parsed.data as z.infer<typeof weightArgsSchema>;
      const entered: WeightUnit = a.unit ?? userUnit;

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
        (entered === userUnit ? "" : ` — shown as ${fromKg(log.weight, userUnit, BODY_WEIGHT_DECIMALS)} ${userUnit} in the app`)
      );
    }

    case "list_weight": {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const logs = await prisma.weightLog.findMany({
        where: { userId, loggedAt: { gte: since } },
        orderBy: { loggedAt: "asc" },
        take: 200,
      });
      if (logs.length === 0) return "No weight logs in the last 30 days.";
      return logs
        .map((l) => `[${l.id}] ${localDateInTz(l.loggedAt, tz)}: ${fromKg(l.weight, userUnit, BODY_WEIGHT_DECIMALS)} ${userUnit}`)
        .join("\n");
    }

    case "list_favorites": {
      const [favorites, entries] = await Promise.all([
        prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
        prisma.foodEntry.findMany({
          where: { userId, consumedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { consumedAt: "desc" },
          take: 2000,
        }),
      ]);
      const pinnedNames = new Set(favorites.map((f) => f.name.trim().toLowerCase()));
      const seen = new Map<string, { e: (typeof entries)[number]; count: number }>();
      for (const e of entries) {
        const key = e.name.trim().toLowerCase();
        if (pinnedNames.has(key)) continue;
        const hit = seen.get(key);
        if (hit) hit.count += 1;
        else seen.set(key, { e, count: 1 });
      }
      const recentUniq = [...seen.values()]
        .sort((a, b) => b.count - a.count || b.e.consumedAt.getTime() - a.e.consumedAt.getTime())
        .slice(0, 10);

      const favLines = favorites.map(
        (f) => `★ [fav:${f.id}] ${f.name}: ${f.calories} kcal (P:${f.protein} C:${f.carbs} F:${f.fat})${f.mealType ? ` — ${f.mealType}` : ""}`,
      );
      const recentLines = recentUniq.map(({ e, count }) => {
        const portion =
          e.quantity != null && e.quantityUnit
            ? ` [${formatQuantity(e.quantity, e.quantityUnit as QuantityUnit)}]`
            : "";
        return `  ${e.name}${portion}: ${e.calories} kcal (P:${e.protein} C:${e.carbs} F:${e.fat}) — ${e.mealType} (${count}×)`;
      });
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
      const targetDateStr = dateParam ?? todayInTz(tz);

      const { workout: saved, parsed: parsedWorkout } = await prisma.$transaction((tx) =>
        upsertWorkoutForDay(tx, userId, {
          date: targetDateStr,
          title,
          rawNote: note,
          source: "mcp",
          timezone: tz,
          defaultUnit: userUnit,
        }),
      );

      const lines: string[] = [
        `Logged workout "${saved?.title ?? title ?? "Workout"}" for ${targetDateStr}:`,
      ];
      for (const ex of parsedWorkout.exercises) {
        const workingSets = ex.sets.filter((s) => !s.isWarmup);
        const candidates = workingSets.length > 0 ? workingSets : ex.sets;
        const topSet = [...candidates].sort(
          (a, b) => toKg(b.weight, b.unit) - toKg(a.weight, a.unit) || b.reps - a.reps,
        )[0];
        lines.push(
          `• ${ex.name}: ${ex.sets.length} set${ex.sets.length === 1 ? "" : "s"}${
            topSet
              ? ` (top: ${formatSetSummary(topSet, topSet.unit, { weightIsKg: false })})`
              : ""
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
        orderBy: { createdAt: "desc" },
      });

      if (!workout) {
        return `No workout logged for ${targetDateStr}.`;
      }

      const lines: string[] = [
        `# ${workout.title} (${targetDateStr})`,
        "",
        workout.rawNote,
      ];

      if (workout.exercises.length > 0) {
        const summaries = await getExerciseSummariesBatch(
          userId,
          workout.exercises.map((we) => we.exercise),
          workout.date,
          userUnit,
          tz,
        );
        const statLines: string[] = [];
        for (const we of workout.exercises) {
          const summary = summaries[we.exerciseId];
          if (summary?.lastPerformance) {
            statLines.push(
              `• ${we.exercise.name} — previous: ${summary.lastPerformance}${summary.lastDate ? ` (${summary.lastDate})` : ""}`,
            );
          }
        }
        if (statLines.length > 0) {
          lines.push("", "Performance vs. previous session:", ...statLines);
        }
      }

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

      const history = await getExerciseFullHistory(userId, ex.id, userUnit, tz);
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
        const setStrings = s.sets.map((set) =>
          formatSetSummary(set, userUnit, { weightIsKg: false, includeTags: true }),
        );
        lines.push(`• ${s.date} (${s.workoutTitle}): ${setStrings.join(", ")}`);
      }

      return lines.join("\n");
    }

    case "suggest_next_workout": {
      const { routine } = parsed.data as z.infer<typeof suggestNextWorkoutSchema>;

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
        const needle = routine.trim().toLowerCase();
        const template = WORKOUT_TEMPLATES.find(
          (t) =>
            t.name.toLowerCase().includes(needle) ||
            needle.includes(t.name.toLowerCase()) ||
            t.id === needle,
        );
        if (template) {
          return template.rawNote(userUnit);
        }
        return `No previous workout matching "${routine}" was found. Try specifying one of your logged routine names or one of: ${WORKOUT_TEMPLATES.map((t) => t.name).join(", ")}.`;
      }

      const weightStep = userUnit === "lb" ? 5 : 2.5;
      const suggestedExercises = prev.exercises.map((we) => {
        const sets = we.sets.map((s) => {
          const w = fromKg(s.weight, userUnit);
          if (s.isWarmup) {
            return {
              weight: w,
              unit: userUnit,
              reps: s.reps,
              isWarmup: true,
              isBodyweight: s.isBodyweight,
            };
          }
          if (s.isBodyweight && w === 0) {
            return {
              weight: 0,
              unit: userUnit,
              reps: s.reps + 1,
              isWarmup: false,
              isBodyweight: true,
            };
          }
          const nextReps = s.reps >= 10 ? 8 : s.reps + 1;
          const nextWeight = s.reps >= 10 ? Math.round((w + weightStep) * 10) / 10 : w;
          return {
            weight: nextWeight,
            unit: userUnit,
            reps: nextReps,
            isWarmup: false,
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

      let itemsToImport: Array<{ date: string; title: string; rawNote: string }> = [];

      if (markdown) {
        const parsedMulti = parseMultiWorkoutMarkdown(markdown, userUnit, todayInTz(tz));
        itemsToImport = parsedMulti.map((p) => ({
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
        throw new ToolError("Must provide either markdown or workouts array");
      }

      if (itemsToImport.length === 0) {
        return "No valid workouts found in input.";
      }
      if (itemsToImport.length > 365) {
        throw new ToolError("Cannot import more than 365 workouts in a single call.");
      }

      if (dryRun) {
        const previews = itemsToImport.map((item) => {
          const parsedNote = parseWorkoutNote(item.rawNote, userUnit);
          const resolvedTitle =
            parsedNote.title && parsedNote.title !== "Workout" ? parsedNote.title : item.title;
          return `• ${item.date} (${resolvedTitle}): ${parsedNote.exercises.length} exercises, ${parsedNote.exercises.reduce((acc, e) => acc + e.sets.length, 0)} sets`;
        });
        return `[DRY RUN PREVIEW] Found ${itemsToImport.length} workouts:\n${previews.join("\n")}\n\nCall import_workouts with dryRun: false to commit.`;
      }

      const results = await prisma.$transaction(
        async (tx) => {
          let createdCount = 0;
          let updatedCount = 0;

          for (const item of itemsToImport) {
            const res = await upsertWorkoutForDay(tx, userId, {
              date: item.date,
              title: item.title,
              rawNote: item.rawNote,
              source: "mcp",
              timezone: tz,
              defaultUnit: userUnit,
              overwrite: overwrite !== false,
            });
            if (res.status === "created") createdCount++;
            else if (res.status === "updated") updatedCount++;
          }

          return { createdCount, updatedCount };
        },
        { timeout: 30_000 },
      );

      return `Successfully imported ${results.createdCount + results.updatedCount} workouts (${results.createdCount} new, ${results.updatedCount} updated).`;
    }

    case "export_workouts": {
      const { format, startDate, endDate } = parsed.data as z.infer<typeof exportWorkoutsSchema>;
      if (startDate && endDate && startDate > endDate) {
        throw new ToolError("startDate must not be after endDate");
      }

      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (startDate) dateFilter.gte = dayBoundsInTz(startDate, tz).start;
      if (endDate) dateFilter.lt = dayBoundsInTz(endDate, tz).end;

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
        take: 500,
      });

      if (workouts.length === 0) {
        return "No workouts found to export.";
      }

      if (format === "markdown") {
        return generateObsidianExport(
          workouts.map((w) => ({
            date: localDateInTz(w.date, tz),
            title: w.title,
            rawNote: w.rawNote,
          })),
        );
      }

      return JSON.stringify(
        workouts.map((w) => ({
          date: localDateInTz(w.date, tz),
          title: w.title,
          rawNote: w.rawNote,
          notes: w.notes,
          exercises: w.exercises.map((we) => ({
            name: we.exercise.name,
            muscleGroup: we.exercise.muscleGroup,
            notes: we.notes,
            sets: we.sets.map((s) => ({
              setNumber: s.setNumber,
              weight: fromKg(s.weight, userUnit),
              weightKg: s.weight,
              unit: userUnit,
              reps: s.reps,
              isWarmup: s.isWarmup,
              isBodyweight: s.isBodyweight,
              rpe: s.rpe,
              notes: s.notes,
            })),
          })),
        })),
        null,
        2,
      );
    }

    case "get_workout_summary": {
      const { days } = parsed.data as z.infer<typeof workoutSummarySchema>;
      const summary = await getWorkoutMacroSummary(userId, days, userUnit, tz);

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
      throw new ToolError(`Unknown tool: ${name}`);
  }
}
