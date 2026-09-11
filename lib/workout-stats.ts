import { prisma } from "./prisma";
import { calculate1RM } from "./workout-parser";
import { fromKg, type WeightUnit } from "./units";

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
): Promise<ExerciseSummaryStats | null> {
  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, userId },
  });

  if (!exercise) return null;

  // Find all previous workout exercises for this exercise
  const logs = await prisma.workoutExercise.findMany({
    where: {
      exerciseId,
      workout: {
        userId,
        date: { lt: beforeDate },
      },
    },
    include: {
      workout: true,
      sets: {
        orderBy: { setNumber: "asc" },
      },
    },
    orderBy: {
      workout: { date: "desc" },
    },
  });

  let bestWeightKg = 0;
  let best1RMKg = 0;
  let totalSetsLogged = 0;

  // Compute lifetime bests
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

  // Find the immediately preceding workout with valid working sets
  if (logs.length > 0) {
    const lastLog = logs[0];
    lastDate = lastLog.workout.date.toISOString().slice(0, 10);
    const workingSets = lastLog.sets.filter((s) => !s.isWarmup);
    const setsToFormat = workingSets.length > 0 ? workingSets : lastLog.sets;

    if (setsToFormat.length > 0) {
      // Group by weight if all same weight, or format nicely
      const firstWeight = fromKg(setsToFormat[0].weight, displayUnit);
      const allSameWeight = setsToFormat.every(
        (s) => fromKg(s.weight, displayUnit) === firstWeight && s.isBodyweight === setsToFormat[0].isBodyweight,
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
 * Returns full history for an exercise (for charts & detail modal)
 */
export async function getExerciseFullHistory(
  userId: string,
  exerciseId: string,
  displayUnit: WeightUnit = "kg",
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
        sessionVolumeKg += s.weight * s.reps;
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
      date: log.workout.date.toISOString().slice(0, 10),
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
      muscleGroup: exercise.muscleGroup,
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
