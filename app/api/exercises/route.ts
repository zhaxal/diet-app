import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { isWeightUnit, type WeightUnit } from "@/lib/units";
import { getExerciseSummary } from "@/lib/workout-stats";
import { DEFAULT_EXERCISES, lookupMuscleGroup } from "@/lib/default-exercises";

// GET /api/exercises?q=bench&muscle=Chest
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const query = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const muscle = req.nextUrl.searchParams.get("muscle")?.trim() || "";
  const displayUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  // 1. Get user's logged exercises
  const userExercises = await prisma.exercise.findMany({
    where: {
      userId: user.id,
      ...(query ? { name: { contains: query } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const userExercisesWithStats = await Promise.all(
    userExercises.map(async (ex) => {
      const summary = await getExerciseSummary(user.id, ex.id, new Date(), displayUnit);
      return {
        id: ex.id,
        name: ex.name,
        normalized: ex.normalized,
        muscleGroup: ex.muscleGroup || lookupMuscleGroup(ex.name) || "Other",
        isCustom: true,
        summary,
      };
    }),
  );

  const seenNormalized = new Set(userExercisesWithStats.map((e) => e.normalized));

  // 2. Filter default catalog
  const filteredDefaults = DEFAULT_EXERCISES.filter((def) => {
    if (seenNormalized.has(def.normalized)) return false;
    if (query && !def.name.toLowerCase().includes(query) && !def.normalized.includes(query)) {
      return false;
    }
    if (muscle && muscle !== "All" && def.muscleGroup !== muscle) {
      return false;
    }
    return true;
  }).map((def) => ({
    id: `catalog_${def.normalized}`,
    name: def.name,
    normalized: def.normalized,
    muscleGroup: def.muscleGroup,
    equipment: def.equipment,
    isCustom: false,
    summary: null,
  }));

  // 3. Filter user exercises by muscle group if requested
  const filteredUserExercises = userExercisesWithStats.filter((ex) => {
    if (muscle && muscle !== "All" && ex.muscleGroup !== muscle) {
      return false;
    }
    return true;
  });

  // User logged exercises first, followed by default catalog exercises
  const combined = [...filteredUserExercises, ...filteredDefaults];

  return NextResponse.json({ exercises: combined });
}
