import { prisma } from "./prisma";
import { calculate1RM } from "./workout-parser";
import { fromKg, type WeightUnit } from "./units";
import { localDateInTz, todayInTz, dayBoundsInTz } from "./time";
import { lookupMuscleGroup } from "./default-exercises";

export interface ExerciseSummaryStats {
  exerciseId: string;
  exerciseName: string;
  normalized: string;
  lastPerformance?: string;
  lastDate?: string;
  bestWeightKg: number;
  best1RMKg: number;
  totalSetsLogged: number;
}

type LogWithWorkoutAndSets = {
  workoutId: string;
  exerciseId: string;
  notes: string | null;
  workout: { date: Date; title: string };
  sets: Array<{
    id: string;
    setNumber: number;
    weight: number;
    unit: string;
    reps: number;
    isWarmup: boolean;
    isBodyweight: boolean;
    rpe: number | null;
  }>;
};

function formatSummaryFromLogs(
  exercise: { id: string; name: string; normalized: string },
  logs: LogWithWorkoutAndSets[],
  displayUnit: WeightUnit,
  timezone: string,
): ExerciseSummaryStats {
  let bestWeightKg = 0;
  let best1RMKg = 0;
  let totalSetsLogged = 0;

  for (const log of logs) {
    for (const s of log.sets) {
      if (s.isWarmup) continue;
      totalSetsLogged++;
      if (s.weight > bestWeightKg) {
        bestWeightKg = s.weight;
      }
      const est1RM = calculate1RM(s.weight, s.reps);
      if (est1RM > best1RMKg) {
        best1RMKg = est1RM;
      }
    }
  }

  let lastPerformance: string | undefined;
  let lastDate: string | undefined;

  // Find the immediately preceding workout with actual sets (skipping note-only logs).
  const lastLog = logs.find((l) => l.sets.length > 0);
  if (lastLog) {
    lastDate = localDateInTz(lastLog.workout.date, timezone);
    const workingSets = lastLog.sets.filter((s) => !s.isWarmup);
    const setsToFormat = workingSets.length > 0 ? workingSets : lastLog.sets;

    const firstWeight = fromKg(setsToFormat[0].weight, displayUnit);
    const allSameWeight = setsToFormat.every(
      (s) =>
        fromKg(s.weight, displayUnit) === firstWeight &&
        s.isBodyweight === setsToFormat[0].isBodyweight,
    );

    if (allSameWeight) {
      const repsList = setsToFormat.map((s) => s.reps).join(", ");
      const weightLabel = setsToFormat[0].isBodyweight
        ? firstWeight > 0
          ? `+${firstWeight}${displayUnit}`
          : firstWeight < 0
            ? `${firstWeight}${displayUnit}`
            : "BW"
        : `${firstWeight}${displayUnit}`;
      lastPerformance = `${weightLabel} × ${repsList}`;
    } else {
      lastPerformance = setsToFormat
        .map((s) => {
          const w = fromKg(s.weight, displayUnit);
          const wLabel = s.isBodyweight
            ? w > 0
              ? `+${w}${displayUnit}`
              : w < 0
                ? `${w}${displayUnit}`
                : "BW"
            : `${w}${displayUnit}`;
          return `${wLabel} × ${s.reps}`;
        })
        .join(", ");
    }
  }

  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    normalized: exercise.normalized,
    lastPerformance,
    lastDate,
    bestWeightKg,
    best1RMKg,
    totalSetsLogged,
  };
}

/**
 * Batch-load summary stats for many exercises in a single query.
 */
export async function getExerciseSummariesBatch(
  userId: string,
  exercises: Array<{ id: string; name: string; normalized: string }>,
  beforeDate?: Date,
  displayUnit: WeightUnit = "kg",
  timezone: string = "UTC",
): Promise<Record<string, ExerciseSummaryStats>> {
  if (exercises.length === 0) return {};
  const ids = exercises.map((e) => e.id);

  const logs = await prisma.workoutExercise.findMany({
    where: {
      exerciseId: { in: ids },
      workout: {
        userId,
        ...(beforeDate ? { date: { lt: beforeDate } } : {}),
      },
    },
    include: {
      workout: { select: { date: true, title: true } },
      sets: { orderBy: { setNumber: "asc" } },
    },
    orderBy: { workout: { date: "desc" } },
  });

  const logsByExercise = new Map<string, LogWithWorkoutAndSets[]>();
  for (const log of logs) {
    const arr = logsByExercise.get(log.exerciseId);
    if (arr) arr.push(log);
    else logsByExercise.set(log.exerciseId, [log]);
  }

  const out: Record<string, ExerciseSummaryStats> = {};
  for (const ex of exercises) {
    out[ex.id] = formatSummaryFromLogs(
      ex,
      logsByExercise.get(ex.id) ?? [],
      displayUnit,
      timezone,
    );
  }
  return out;
}

/**
 * Returns summary stats for a given exercise:
 * - The most recent workout session prior to `beforeDate` (formatted as e.g. "80kg × 8, 8, 7")
 * - Lifetime best weight and lifetime best estimated 1RM
 */
export async function getExerciseSummary(
  userId: string,
  exerciseId: string,
  beforeDate: Date = new Date(),
  displayUnit: WeightUnit = "kg",
  timezone: string = "UTC",
): Promise<ExerciseSummaryStats | null> {
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, userId },
    select: { id: true, name: true, normalized: true },
  });

  if (!exercise) return null;

  const logs = await prisma.workoutExercise.findMany({
    where: {
      exerciseId,
      workout: {
        userId,
        date: { lt: beforeDate },
      },
    },
    include: {
      workout: { select: { date: true, title: true } },
      sets: { orderBy: { setNumber: "asc" } },
    },
    orderBy: { workout: { date: "desc" } },
  });

  return formatSummaryFromLogs(exercise, logs, displayUnit, timezone);
}

/**
 * Returns full history for an exercise (for charts & detail modal)
 */
export async function getExerciseFullHistory(
  userId: string,
  exerciseId: string,
  displayUnit: WeightUnit = "kg",
  timezone: string = "UTC",
) {
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, userId },
  });

  if (!exercise) return null;

  const logs = await prisma.workoutExercise.findMany({
    where: {
      exerciseId,
      workout: { userId },
    },
    include: {
      workout: true,
      sets: {
        orderBy: { setNumber: "asc" },
      },
    },
    orderBy: {
      workout: { date: "asc" }, // chronological for charts
    },
  });

  let bestWeightKg = 0;
  let best1RMKg = 0;
  let totalVolumeKg = 0;

  const sessions = logs.map((log) => {
    let sessionTopWeightKg = 0;
    let sessionTop1RMKg = 0;
    let sessionVolumeKg = 0;

    const formattedSets = log.sets.map((s) => {
      if (!s.isWarmup) {
        if (s.weight > sessionTopWeightKg) sessionTopWeightKg = s.weight;
        const est1RM = calculate1RM(s.weight, s.reps);
        if (est1RM > sessionTop1RMKg) sessionTop1RMKg = est1RM;
        sessionVolumeKg += Math.max(0, s.weight) * s.reps;
      }

      return {
        id: s.id,
        setNumber: s.setNumber,
        weight: fromKg(s.weight, displayUnit),
        weightKg: s.weight,
        unit: displayUnit,
        reps: s.reps,
        isWarmup: s.isWarmup,
        isBodyweight: s.isBodyweight,
        rpe: s.rpe,
      };
    });

    if (sessionTopWeightKg > bestWeightKg) bestWeightKg = sessionTopWeightKg;
    if (sessionTop1RMKg > best1RMKg) best1RMKg = sessionTop1RMKg;
    totalVolumeKg += sessionVolumeKg;

    return {
      workoutId: log.workoutId,
      date: localDateInTz(log.workout.date, timezone),
      workoutTitle: log.workout.title,
      notes: log.notes,
      topWeight: fromKg(sessionTopWeightKg, displayUnit),
      top1RM: fromKg(sessionTop1RMKg, displayUnit),
      volume: fromKg(sessionVolumeKg, displayUnit),
      sets: formattedSets,
    };
  });

  return {
    exercise: {
      id: exercise.id,
      name: exercise.name,
      normalized: exercise.normalized,
      muscleGroup: exercise.muscleGroup ?? lookupMuscleGroup(exercise.name) ?? null,
    },
    lifetime: {
      bestWeight: fromKg(bestWeightKg, displayUnit),
      best1RM: fromKg(best1RMKg, displayUnit),
      totalVolume: fromKg(totalVolumeKg, displayUnit),
      totalSessions: sessions.length,
    },
    sessions,
  };
}

export interface MacroWorkoutSummary {
  periodDays: number;
  totalWorkouts: number;
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  displayUnit: WeightUnit;
  muscleGroups: Record<string, { sets: number; percentage: number }>;
  recentWorkouts: Array<{
    id: string;
    date: string;
    title: string;
    exercisesCount: number;
    setsCount: number;
    volume: number;
  }>;
}

/**
 * Computes macro-level workout analytics for a user over a time window.
 */
export async function getWorkoutMacroSummary(
  userId: string,
  days: number = 30,
  displayUnit: WeightUnit = "kg",
  timezone: string = "UTC",
): Promise<MacroWorkoutSummary> {
  const today = todayInTz(timezone);
  const { end } = dayBoundsInTz(today, timezone);
  const since = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: since, lt: end },
    },
    include: {
      exercises: {
        include: {
          exercise: true,
          sets: true,
        },
      },
    },
    orderBy: { date: "desc" },
  });

  let totalVolumeKg = 0;
  let totalSets = 0;
  let totalReps = 0;
  const muscleSets: Record<string, number> = {};

  const recentWorkouts = workouts.map((w) => {
    let sessionVol = 0;
    let sessionSets = 0;

    for (const we of w.exercises) {
      const muscle =
        we.exercise.muscleGroup || lookupMuscleGroup(we.exercise.name) || "Other";
      for (const s of we.sets) {
        if (!s.isWarmup) {
          sessionSets++;
          totalSets++;
          totalReps += s.reps;
          const vol = Math.max(0, s.weight) * s.reps;
          sessionVol += vol;
          totalVolumeKg += vol;
          muscleSets[muscle] = (muscleSets[muscle] || 0) + 1;
        }
      }
    }

    return {
      id: w.id,
      date: localDateInTz(w.date, timezone),
      title: w.title,
      exercisesCount: w.exercises.length,
      setsCount: sessionSets,
      volume: fromKg(sessionVol, displayUnit),
    };
  });

  // Calculate percentage for each muscle group
  const muscleGroups: Record<string, { sets: number; percentage: number }> = {};
  for (const [group, count] of Object.entries(muscleSets)) {
    muscleGroups[group] = {
      sets: count,
      percentage: totalSets > 0 ? Math.round((count / totalSets) * 100) : 0,
    };
  }

  return {
    periodDays: days,
    totalWorkouts: workouts.length,
    totalVolume: fromKg(totalVolumeKg, displayUnit),
    totalSets,
    totalReps,
    displayUnit,
    muscleGroups,
    recentWorkouts,
  };
}

