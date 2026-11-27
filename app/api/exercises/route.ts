import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { dayBoundsInTz, todayInTz } from "@/lib/time";
import { isWeightUnit, type WeightUnit } from "@/lib/units";
import { getExerciseSummariesBatch } from "@/lib/workout-stats";
import { DEFAULT_EXERCISES, lookupMuscleGroup } from "@/lib/default-exercises";

// GET /api/exercises?q=bench&muscle=Chest
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const query = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const muscle = req.nextUrl.searchParams.get("muscle")?.trim() || "";
  const displayUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  // Fetch user's exercises, filter by muscle group before slicing so matching
  // exercises outside the 100 most recent are still returned.
  const allUserExercises = await prisma.exercise.findMany({
    where: {
      userId: user.id,
      ...(query ? { name: { contains: query } } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });

  const resolvedUserExercises = allUserExercises
    .map((ex) => ({
      ...ex,
      resolvedMuscleGroup: ex.muscleGroup || lookupMuscleGroup(ex.name) || "Other",
    }))
    .filter((ex) => !muscle || muscle === "All" || ex.resolvedMuscleGroup === muscle)
    .slice(0, 100);

  const todayEnd = dayBoundsInTz(todayInTz(user.timezone), user.timezone).end;
  const summaries = await getExerciseSummariesBatch(
    user.id,
    resolvedUserExercises,
    todayEnd,
    displayUnit,
    user.timezone,
  );

  const filteredUserExercises = resolvedUserExercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    normalized: ex.normalized,
    muscleGroup: ex.resolvedMuscleGroup,
    isCustom: true,
    summary: summaries[ex.id] ?? null,
  }));

  const seenNormalized = new Set(allUserExercises.map((e) => e.normalized));

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

  // User logged exercises first, followed by default catalog exercises
  const combined = [...filteredUserExercises, ...filteredDefaults];

  return NextResponse.json({ exercises: combined });
}
