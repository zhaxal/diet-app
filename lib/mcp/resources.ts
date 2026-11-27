import { prisma } from "../prisma";
import { dayBoundsInTz, localDateInTz, shiftCalendarDate, todayInTz } from "../time";
import { BODY_WEIGHT_DECIMALS, fromKg, isWeightUnit, type WeightUnit } from "../units";
import { ResourceError } from "./errors";
import type { McpUser } from "./tools";

export const RESOURCES = [
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

const r1 = (n: number) => Math.round(n * 10) / 10;

export async function readResource(
  uri: string,
  user: McpUser,
): Promise<{ uri: string; mimeType: string; text: string }> {
  const userId = user.id;
  const tz = user.timezone;
  const displayUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  switch (uri) {
    case "diet://today/summary": {
      const today = todayInTz(tz);
      const { start, end } = dayBoundsInTz(today, tz);
      const [entries, goals] = await Promise.all([
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
          protein: r1(acc.protein + e.protein),
          carbs: r1(acc.carbs + e.carbs),
          fat: r1(acc.fat + e.fat),
          fiber: r1(acc.fiber + e.fiber),
          sugar: r1(acc.sugar + e.sugar),
          sodium: Math.round(acc.sodium + e.sodium),
          count: acc.count + 1,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, count: 0 },
      );

      const hasAnyGoal =
        goals != null &&
        (goals.dailyCalories != null ||
          goals.dailyProtein != null ||
          goals.dailyCarbs != null ||
          goals.dailyFat != null ||
          goals.dailyFiber != null ||
          goals.dailySugar != null ||
          goals.dailySodium != null);

      const rem = (target: number | null | undefined, val: number, roundFn = r1) =>
        target != null ? roundFn(Math.max(0, target - val)) : null;

      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            date: today,
            timezone: tz,
            totals,
            goals: {
              calories: goals?.dailyCalories ?? null,
              protein: goals?.dailyProtein ?? null,
              carbs: goals?.dailyCarbs ?? null,
              fat: goals?.dailyFat ?? null,
              fiber: goals?.dailyFiber ?? null,
              sugar: goals?.dailySugar ?? null,
              sodium: goals?.dailySodium ?? null,
            },
            remaining: hasAnyGoal
              ? {
                  calories: rem(goals?.dailyCalories, totals.calories, Math.round),
                  protein: rem(goals?.dailyProtein, totals.protein),
                  carbs: rem(goals?.dailyCarbs, totals.carbs),
                  fat: rem(goals?.dailyFat, totals.fat),
                  fiber: rem(goals?.dailyFiber, totals.fiber),
                  sugar: rem(goals?.dailySugar, totals.sugar),
                  sodium: rem(goals?.dailySodium, totals.sodium, Math.round),
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
      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          take: 100,
        }),
        prisma.product.count({ where: { userId } }),
      ]);

      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            total,
            truncated: total > products.length,
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
      const goals = await prisma.user.findUnique({
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
        text: JSON.stringify(goals ?? {}, null, 2),
      };
    }

    case "diet://weight/recent": {
      const today = todayInTz(tz);
      const fromDay = shiftCalendarDate(today, -29);
      const { start } = dayBoundsInTz(fromDay, tz);
      const { end } = dayBoundsInTz(today, tz);

      const logs = await prisma.weightLog.findMany({
        where: { userId, loggedAt: { gte: start, lt: end } },
        orderBy: { loggedAt: "desc" },
        take: 100,
      });

      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            unit: displayUnit,
            count: logs.length,
            logs: logs.map((l) => ({
              id: l.id,
              date: localDateInTz(l.loggedAt, tz),
              weight: fromKg(l.weight, displayUnit, BODY_WEIGHT_DECIMALS),
              weightKg: l.weight,
              enteredUnit: l.unit,
              loggedAt: l.loggedAt.toISOString(),
            })),
          },
          null,
          2,
        ),
      };
    }

    default:
      throw new ResourceError(`Unknown resource URI: ${uri}`);
  }
}
