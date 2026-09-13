import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { workoutInputSchema, dateQuerySchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";
import { dayBoundsInTz, zonedWallToUtc } from "@/lib/time";
import { parseWorkoutNote } from "@/lib/workout-parser";
import { toKg, isWeightUnit, type WeightUnit } from "@/lib/units";
import { getExerciseSummary } from "@/lib/workout-stats";

// GET /api/workouts?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return jsonError("date parameter is required (YYYY-MM-DD)", 400);
  }

  const parsed = dateQuerySchema.safeParse(dateParam);
  if (!parsed.success) return zodError(parsed.error);

  const { start, end } = dayBoundsInTz(parsed.data, user.timezone);

  const workout = await prisma.workout.findFirst({
    where: {
      userId: user.id,
      date: { gte: start, lt: end },
    },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: {
          exercise: true,
          sets: {
            orderBy: { setNumber: "asc" },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const displayUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  // Gather stats for all recognized exercises in this workout (or recent exercises)
  const exerciseStats: Record<string, unknown> = {};

  if (workout) {
    for (const we of workout.exercises) {
      const summary = await getExerciseSummary(
        user.id,
        we.exerciseId,
        workout.date,
        displayUnit,
      );
      if (summary) {
        exerciseStats[we.exercise.normalized] = summary;
      }
    }
  }

  return NextResponse.json({
    workout,
    exerciseStats,
  });
}

// POST /api/workouts — Create or update workout note for a day
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = workoutInputSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { date: dateStr, title, rawNote, source } = parsed.data;
  const userUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  // Anchor date at local noon in user's timezone
  const workoutUtcDate = zonedWallToUtc(dateStr, "12:00:00.000", user.timezone);
  const { start, end } = dayBoundsInTz(dateStr, user.timezone);

  // Parse markdown into exercises and sets
  const parsedWorkout = parseWorkoutNote(rawNote, userUnit);
  const resolvedTitle = parsedWorkout.title && parsedWorkout.title !== "Workout"
    ? parsedWorkout.title
    : title || "Workout";

  const savedWorkout = await prisma.$transaction(async (tx) => {
    // 1. Find existing workout for this date or create a new one
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
          rawNote,
          notes: parsedWorkout.notes,
          source: source || "ui",
        },
      });
    } else {
      // Clear old workout exercises to rewrite cleanly
      await tx.workoutExercise.deleteMany({
        where: { workoutId: existing.id },
      });

      existing = await tx.workout.update({
        where: { id: existing.id },
        data: {
          title: resolvedTitle,
          rawNote,
          notes: parsedWorkout.notes,
          source: source || existing.source,
          updatedAt: new Date(),
        },
      });
    }

    // 2. Insert exercises and sets
    for (let i = 0; i < parsedWorkout.exercises.length; i++) {
      const parsedEx = parsedWorkout.exercises[i];

      // Upsert the Exercise catalog record
      const exercise = await tx.exercise.upsert({
        where: {
          userId_normalized: {
            userId: user.id,
            normalized: parsedEx.normalized,
          },
        },
        update: {
          name: parsedEx.name,
        },
        create: {
          userId: user.id,
          name: parsedEx.name,
          normalized: parsedEx.normalized,
        },
      });

      // Create WorkoutExercise link
      const we = await tx.workoutExercise.create({
        data: {
          workoutId: existing.id,
          exerciseId: exercise.id,
          order: i,
          notes: parsedEx.notes,
        },
      });

      // Create sets
      if (parsedEx.sets.length > 0) {
        await tx.workoutSet.createMany({
          data: parsedEx.sets.map((s) => ({
            workoutExerciseId: we.id,
            setNumber: s.setNumber,
            // Convert to canonical kg
            weight: toKg(s.weight, s.unit),
            unit: s.unit,
            reps: s.reps,
            isWarmup: s.isWarmup,
            isBodyweight: s.isBodyweight,
            rpe: s.rpe,
            notes: s.notes,
          })),
        });
      }
    }

    return tx.workout.findUnique({
      where: { id: existing.id },
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
  });

  // Calculate stats for recognized exercises
  const exerciseStats: Record<string, unknown> = {};
  if (savedWorkout) {
    for (const we of savedWorkout.exercises) {
      const summary = await getExerciseSummary(
        user.id,
        we.exerciseId,
        savedWorkout.date,
        userUnit,
      );
      if (summary) {
        exerciseStats[we.exercise.normalized] = summary;
      }
    }
  }

  return NextResponse.json({
    workout: savedWorkout,
    exerciseStats,
  });
}

// DELETE /api/workouts?id=... or ?date=YYYY-MM-DD
export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const id = req.nextUrl.searchParams.get("id");
  const dateParam = req.nextUrl.searchParams.get("date");
  if (!id && !dateParam) {
    return jsonError("id or date parameter is required", 400);
  }

  let existing = null;
  if (id) {
    existing = await prisma.workout.findFirst({
      where: { id, userId: user.id },
    });
  } else if (dateParam) {
    const parsed = dateQuerySchema.safeParse(dateParam);
    if (!parsed.success) return zodError(parsed.error);
    const { start, end } = dayBoundsInTz(parsed.data, user.timezone);
    existing = await prisma.workout.findFirst({
      where: {
        userId: user.id,
        date: { gte: start, lt: end },
      },
    });
  }

  if (!existing) return jsonError("Workout not found", 404);

  await prisma.workout.delete({
    where: { id: existing.id },
  });

  return NextResponse.json({ ok: true });
}
