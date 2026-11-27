import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { workoutImportSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";
import { parseMultiWorkoutMarkdown, parseWorkoutNote } from "@/lib/workout-parser";
import { todayInTz } from "@/lib/time";
import { isWeightUnit, type WeightUnit } from "@/lib/units";
import { upsertWorkoutForDay } from "@/lib/services/workouts";

// POST /api/workouts/import
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const validated = workoutImportSchema.safeParse(body);
  if (!validated.success) return zodError(validated.error);

  const payload = validated.data;
  const userUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  let itemsToImport: Array<{ date: string; title: string; rawNote: string }> = [];

  if (payload.markdown) {
    const parsed = parseMultiWorkoutMarkdown(
      payload.markdown,
      userUnit,
      todayInTz(user.timezone),
    );
    itemsToImport = parsed.map((p) => ({
      date: p.date,
      title: p.title,
      rawNote: p.rawNote,
    }));
  } else if (payload.workouts) {
    itemsToImport = payload.workouts.map((w) => ({
      date: w.date,
      title: w.title || "Workout",
      rawNote: w.note,
    }));
  }

  if (itemsToImport.length === 0) {
    return jsonError("No valid workouts found in input", 400);
  }
  if (itemsToImport.length > 365) {
    return jsonError("Cannot import more than 365 workouts at once", 422);
  }

  // Pre-parse and calculate stats for preview
  const parsedPreviews = itemsToImport.map((item) => {
    const parsed = parseWorkoutNote(item.rawNote, userUnit);
    const totalSets = parsed.exercises.reduce((acc, e) => acc + e.sets.length, 0);
    return {
      date: item.date,
      title: parsed.title !== "Workout" ? parsed.title : item.title,
      rawNote: item.rawNote,
      exercisesCount: parsed.exercises.length,
      setsCount: totalSets,
      exerciseNames: parsed.exercises.map((e) => e.name),
    };
  });

  if (payload.dryRun) {
    return NextResponse.json({
      dryRun: true,
      totalWorkouts: parsedPreviews.length,
      totalExercises: parsedPreviews.reduce((acc, p) => acc + p.exercisesCount, 0),
      totalSets: parsedPreviews.reduce((acc, p) => acc + p.setsCount, 0),
      workouts: parsedPreviews,
    });
  }

  const overwrite = payload.overwrite !== false;
  const results = await prisma.$transaction(
    async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;

      for (const item of itemsToImport) {
        const res = await upsertWorkoutForDay(tx, user.id, {
          date: item.date,
          title: item.title,
          rawNote: item.rawNote,
          source: "import",
          timezone: user.timezone,
          defaultUnit: userUnit,
          overwrite,
        });
        if (res.status === "created") createdCount++;
        else if (res.status === "updated") updatedCount++;
      }

      return { createdCount, updatedCount };
    },
    { timeout: 30_000 },
  );

  return NextResponse.json({
    ok: true,
    created: results.createdCount,
    updated: results.updatedCount,
    total: results.createdCount + results.updatedCount,
  });
}
