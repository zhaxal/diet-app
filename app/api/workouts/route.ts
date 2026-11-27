import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { workoutInputSchema, dateQuerySchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";
import { dayBoundsInTz } from "@/lib/time";
import { isWeightUnit, type WeightUnit } from "@/lib/units";
import { getExerciseSummariesBatch } from "@/lib/workout-stats";
import { upsertWorkoutForDay } from "@/lib/services/workouts";

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
  const exerciseStats: Record<string, unknown> = {};

  if (workout && workout.exercises.length > 0) {
    const summaries = await getExerciseSummariesBatch(
      user.id,
      workout.exercises.map((we) => we.exercise),
      workout.date,
      displayUnit,
      user.timezone,
    );
    for (const we of workout.exercises) {
      const s = summaries[we.exerciseId];
      if (s) exerciseStats[we.exercise.normalized] = s;
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

  const { workout: savedWorkout } = await prisma.$transaction((tx) =>
    upsertWorkoutForDay(tx, user.id, {
      date: dateStr,
      title,
      rawNote,
      source,
      timezone: user.timezone,
      defaultUnit: userUnit,
    }),
  );

  const exerciseStats: Record<string, unknown> = {};
  if (savedWorkout && savedWorkout.exercises.length > 0) {
    const summaries = await getExerciseSummariesBatch(
      user.id,
      savedWorkout.exercises.map((we) => we.exercise),
      savedWorkout.date,
      userUnit,
      user.timezone,
    );
    for (const we of savedWorkout.exercises) {
      const s = summaries[we.exerciseId];
      if (s) exerciseStats[we.exercise.normalized] = s;
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

  if (id) {
    const { count } = await prisma.workout.deleteMany({
      where: { id, userId: user.id },
    });
    if (count === 0) return jsonError("Workout not found", 404);
    return NextResponse.json({ ok: true });
  }

  const parsed = dateQuerySchema.safeParse(dateParam);
  if (!parsed.success) return zodError(parsed.error);
  const { start, end } = dayBoundsInTz(parsed.data, user.timezone);
  const { count } = await prisma.workout.deleteMany({
    where: {
      userId: user.id,
      date: { gte: start, lt: end },
    },
  });
  if (count === 0) return jsonError("Workout not found", 404);

  return NextResponse.json({ ok: true });
}
