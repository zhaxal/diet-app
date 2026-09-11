import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { fromKg, isWeightUnit, type WeightUnit } from "@/lib/units";

// GET /api/workouts/dates
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const displayUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  const workouts = await prisma.workout.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      date: true,
      title: true,
      exercises: {
        select: {
          sets: {
            select: {
              weight: true,
              reps: true,
              isWarmup: true,
            },
          },
        },
      },
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  const sessions = workouts.map((w) => {
    let setsCount = 0;
    let volumeKg = 0;
    for (const e of w.exercises) {
      for (const s of e.sets) {
        if (!s.isWarmup) {
          setsCount++;
          volumeKg += s.weight * s.reps;
        }
      }
    }

    return {
      id: w.id,
      date: w.date.toISOString().slice(0, 10),
      title: w.title || "Workout",
      setsCount,
      volume: fromKg(volumeKg, displayUnit),
    };
  });

  return NextResponse.json({ sessions });
}
