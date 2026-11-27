import type { Prisma } from "@prisma/client";
import { dayBoundsInTz, zonedWallToUtc } from "../time";
import { fromKg, toKg, type WeightUnit } from "../units";
import { lookupMuscleGroup } from "../default-exercises";
import { parseWorkoutNote, type ParsedWorkout } from "../workout-parser";

export interface UpsertWorkoutParams {
  date: string;
  title?: string;
  rawNote: string;
  source?: "ui" | "mcp" | "import";
  timezone: string;
  defaultUnit: WeightUnit;
  overwrite?: boolean;
}

export async function upsertWorkoutForDay(
  tx: Prisma.TransactionClient,
  userId: string,
  params: UpsertWorkoutParams,
) {
  const { date, title, rawNote, source, timezone, defaultUnit, overwrite = true } = params;
  const { start, end } = dayBoundsInTz(date, timezone);
  const workoutUtcDate = zonedWallToUtc(date, "12:00:00.000", timezone);
  const parsed = parseWorkoutNote(rawNote, defaultUnit);
  const resolvedTitle =
    parsed.title && parsed.title !== "Workout" ? parsed.title : title || "Workout";

  let existing = await tx.workout.findFirst({
    where: { userId, date: { gte: start, lt: end } },
    orderBy: { createdAt: "desc" },
  });

  let status: "created" | "updated" | "skipped";

  if (!existing) {
    existing = await tx.workout.create({
      data: {
        userId,
        date: workoutUtcDate,
        title: resolvedTitle,
        rawNote,
        notes: parsed.notes,
        source: source ?? "ui",
      },
    });
    status = "created";
  } else {
    if (!overwrite) {
      return { status: "skipped" as const, workout: null, parsed };
    }
    await tx.workoutExercise.deleteMany({ where: { workoutId: existing.id } });
    existing = await tx.workout.update({
      where: { id: existing.id },
      data: {
        title: resolvedTitle,
        rawNote,
        notes: parsed.notes,
        source: source ?? existing.source,
        updatedAt: new Date(),
      },
    });
    status = "updated";
  }

  for (let i = 0; i < parsed.exercises.length; i++) {
    const parsedEx = parsed.exercises[i];
    const inferredMuscle = lookupMuscleGroup(parsedEx.name) ?? null;

    const existingExercise = await tx.exercise.findUnique({
      where: {
        userId_normalized: {
          userId,
          normalized: parsedEx.normalized,
        },
      },
    });

    const exercise = existingExercise
      ? await tx.exercise.update({
          where: { id: existingExercise.id },
          data: {
            name: parsedEx.name,
            ...(existingExercise.muscleGroup ? {} : { muscleGroup: inferredMuscle }),
          },
        })
      : await tx.exercise.create({
          data: {
            userId,
            name: parsedEx.name,
            normalized: parsedEx.normalized,
            muscleGroup: inferredMuscle,
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
          notes: s.notes,
        })),
      });
    }
  }

  const workout = await tx.workout.findUnique({
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

  return { status, workout, parsed: parsed as ParsedWorkout };
}

export function formatSetSummary(
  s: {
    weight: number;
    unit?: string;
    reps: number;
    isBodyweight?: boolean;
    isWarmup?: boolean;
    rpe?: number | null;
  },
  displayUnit: WeightUnit,
  opts?: { weightIsKg?: boolean; includeTags?: boolean },
): string {
  const w = opts?.weightIsKg === false
    ? s.weight
    : fromKg(s.weight, displayUnit);
  let loadLabel: string;
  if (s.isBodyweight) {
    if (w > 0) loadLabel = `+${w}${displayUnit}`;
    else if (w < 0) loadLabel = `${w}${displayUnit}`;
    else loadLabel = "BW";
  } else {
    loadLabel = `${w}${displayUnit}`;
  }
  let text = `${loadLabel} × ${s.reps}`;
  if (opts?.includeTags) {
    if (s.isWarmup) text += " (warmup)";
    if (s.rpe != null) text += ` @${s.rpe}`;
  }
  return text;
}
