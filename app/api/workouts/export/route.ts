import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { dayBoundsInTz, isValidCalendarDate, localDateInTz } from "@/lib/time";
import { lookupMuscleGroup } from "@/lib/default-exercises";
import { generateObsidianExport } from "@/lib/workout-parser";
import { fromKg, isWeightUnit, type WeightUnit } from "@/lib/units";

// GET /api/workouts/export?format=markdown|json&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "markdown";
  const startDate = req.nextUrl.searchParams.get("startDate");
  const endDate = req.nextUrl.searchParams.get("endDate");
  const displayUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  if ((startDate && !isValidCalendarDate(startDate)) || (endDate && !isValidCalendarDate(endDate))) {
    return jsonError("startDate and endDate must be valid YYYY-MM-DD calendar dates", 422);
  }
  if (startDate && endDate && startDate > endDate) {
    return jsonError("startDate must not be after endDate", 422);
  }

  const dateFilter: { gte?: Date; lt?: Date } = {};
  if (startDate) dateFilter.gte = dayBoundsInTz(startDate, user.timezone).start;
  if (endDate) dateFilter.lt = dayBoundsInTz(endDate, user.timezone).end;

  const workouts = await prisma.workout.findMany({
    where: {
      userId: user.id,
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

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "markdown") {
    const markdownContent = generateObsidianExport(
      workouts.map((w) => ({
        date: localDateInTz(w.date, user.timezone),
        title: w.title,
        rawNote: w.rawNote,
      })),
    );

    return new NextResponse(markdownContent, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="workouts-export-${stamp}.md"`,
      },
    });
  }

  // JSON export
  const structured = workouts.map((w) => ({
    id: w.id,
    date: localDateInTz(w.date, user.timezone),
    title: w.title,
    rawNote: w.rawNote,
    notes: w.notes,
    source: w.source,
    createdAt: w.createdAt,
    exercises: w.exercises.map((we) => ({
      name: we.exercise.name,
      muscleGroup: we.exercise.muscleGroup ?? lookupMuscleGroup(we.exercise.name) ?? null,
      notes: we.notes,
      sets: we.sets.map((s) => ({
        setNumber: s.setNumber,
        weight: fromKg(s.weight, displayUnit),
        weightKg: s.weight,
        unit: displayUnit,
        reps: s.reps,
        isWarmup: s.isWarmup,
        isBodyweight: s.isBodyweight,
        rpe: s.rpe,
        notes: s.notes,
      })),
    })),
  }));

  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), workouts: structured }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="workouts-export-${stamp}.json"`,
    },
  });
}
