import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { fromKg, isWeightUnit, type WeightUnit } from "@/lib/units";

// GET /api/export?format=json|csv — download all of the user's data.
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const stamp = new Date().toISOString().slice(0, 10);

  const [entries, weightLogs, favorites, templates, products, profile, workouts, exercises] = await Promise.all([
    prisma.foodEntry.findMany({ where: { userId: user.id }, orderBy: { consumedAt: "asc" } }),
    prisma.weightLog.findMany({ where: { userId: user.id }, orderBy: { loggedAt: "asc" } }),
    prisma.favorite.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.mealTemplate.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.product.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        email: true, dailyCalories: true, dailyProtein: true, dailyCarbs: true,
        dailyFat: true, dailyFiber: true, dailySugar: true, dailySodium: true,
        weightUnit: true, timezone: true, sex: true, birthYear: true, heightCm: true,
      },
    }),
    prisma.workout.findMany({
      where: { userId: user.id },
      include: {
        exercises: {
          orderBy: { order: "asc" },
          include: {
            exercise: true,
            sets: { orderBy: { setNumber: "asc" } },
          },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.exercise.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
  ]);

  const displayUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  if (format === "csv") {
    // The CSV used to carry ten columns and drop provenance entirely, so a
    // "200 g of the yoghurt I saved" entry exported as an anonymous row of
    // numbers. Everything the row knows about itself is now in the file.
    const csvRow = (values: unknown[]) =>
      values
        .map((v) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",");

    const header = [
      "consumedAt", "mealType", "name", "calories",
      "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg",
      "quantity", "quantityUnit", "productId", "source",
    ];
    const rows = entries.map((e) =>
      csvRow([
        e.consumedAt.toISOString(), e.mealType, e.name, e.calories,
        e.protein, e.carbs, e.fat, e.fiber, e.sugar, e.sodium,
        e.quantity, e.quantityUnit, e.productId, e.source,
      ]),
    );

    return new NextResponse([csvRow(header), ...rows].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="diet-entries-${stamp}.csv"`,
      },
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    // Says what the numbers in this file mean, so it can be read back — or read
    // by anything else — without knowing the app's internal conventions.
    units: {
      energy: "kcal",
      nutrients: "g, except sodium in mg",
      weight: "kg (canonical); `weight` is also given in the account's unit",
      products: "per 100 g or 100 ml, per each product's `basis`",
    },
    profile,
    entries,
    weightLogs: weightLogs.map(({ unit, ...l }) => ({
      ...l,
      weightKg: l.weight,
      weight: fromKg(l.weight, displayUnit),
      // Named as the API names it, not as the column does.
      enteredUnit: unit,
      displayUnit,
    })),
    favorites,
    products,
    workouts: workouts.map((w) => ({
      id: w.id,
      date: w.date.toISOString().slice(0, 10),
      title: w.title,
      rawNote: w.rawNote,
      exercises: w.exercises.map((we) => ({
        name: we.exercise.name,
        muscleGroup: we.exercise.muscleGroup,
        sets: we.sets.map((s) => ({
          setNumber: s.setNumber,
          weight: fromKg(s.weight, displayUnit),
          weightKg: s.weight,
          unit: displayUnit,
          reps: s.reps,
          isWarmup: s.isWarmup,
          isBodyweight: s.isBodyweight,
        })),
      })),
    })),
    exercises: exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      normalized: ex.normalized,
      muscleGroup: ex.muscleGroup,
    })),
    templates: templates.map((t) => {
      // One malformed row used to throw, taking the whole export down with a
      // 500 — the file you reach for precisely when something is wrong.
      try {
        return { ...t, items: JSON.parse(t.items) };
      } catch {
        return { ...t, items: [], itemsUnparsed: t.items };
      }
    }),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="diet-export-${stamp}.json"`,
    },
  });
}
