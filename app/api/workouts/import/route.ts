import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { parseMultiWorkoutMarkdown, parseWorkoutNote } from "@/lib/workout-parser";
import { dayBoundsInTz, zonedWallToUtc } from "@/lib/time";
import { toKg, isWeightUnit, type WeightUnit } from "@/lib/units";

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

  const payload = body as {
    markdown?: string;
    workouts?: Array<{ date: string; title?: string; note: string }>;
    dryRun?: boolean;
    overwrite?: boolean;
  };

  const userUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  // Parse workouts from markdown or array
  let itemsToImport: Array<{ date: string; title: string; rawNote: string }> = [];

  if (payload.markdown && typeof payload.markdown === "string") {
    const parsed = parseMultiWorkoutMarkdown(payload.markdown, userUnit);
    itemsToImport = parsed.map((p) => ({
      date: p.date,
      title: p.title,
      rawNote: p.rawNote,
    }));
  } else if (Array.isArray(payload.workouts)) {
    itemsToImport = payload.workouts.map((w) => ({
      date: w.date,
      title: w.title || "Workout",
      rawNote: w.note,
    }));
  } else {
    return jsonError("Must provide either markdown text or a workouts array", 400);
  }

  if (itemsToImport.length === 0) {
    return jsonError("No valid workouts found in input", 400);
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

  // Commit import to database
  const results = await prisma.$transaction(async (tx) => {
    let createdCount = 0;
    let updatedCount = 0;

    for (const item of itemsToImport) {
      const { start, end } = dayBoundsInTz(item.date, user.timezone);
      const workoutUtcDate = zonedWallToUtc(item.date, "12:00:00.000", user.timezone);
      const parsedWorkout = parseWorkoutNote(item.rawNote, userUnit);
      const resolvedTitle =
        parsedWorkout.title && parsedWorkout.title !== "Workout"
          ? parsedWorkout.title
          : item.title || "Workout";

      let existing = await tx.workout.findFirst({
        where: {
          userId: user.id,
          date: { gte: start, lt: end },
        },
      });

      if (!existing) {
        existing = await tx.workout.create({
          data: {
            userId: user.id,
            date: workoutUtcDate,
            title: resolvedTitle,
            rawNote: item.rawNote,
            notes: parsedWorkout.notes,
            source: "import",
          },
        });
        createdCount++;
      } else {
        if (payload.overwrite === false) {
          continue; // skip existing
        }
        await tx.workoutExercise.deleteMany({
          where: { workoutId: existing.id },
        });
        existing = await tx.workout.update({
          where: { id: existing.id },
          data: {
            title: resolvedTitle,
            rawNote: item.rawNote,
            notes: parsedWorkout.notes,
            source: "import",
            updatedAt: new Date(),
          },
        });
        updatedCount++;
      }

      // Insert exercises and sets
      for (let i = 0; i < parsedWorkout.exercises.length; i++) {
        const parsedEx = parsedWorkout.exercises[i];

        const exercise = await tx.exercise.upsert({
          where: {
            userId_normalized: {
              userId: user.id,
              normalized: parsedEx.normalized,
            },
          },
          update: { name: parsedEx.name },
          create: {
            userId: user.id,
            name: parsedEx.name,
            normalized: parsedEx.normalized,
          },
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

  return NextResponse.json({
    ok: true,
    created: results.createdCount,
    updated: results.updatedCount,
    total: results.createdCount + results.updatedCount,
  });
}
