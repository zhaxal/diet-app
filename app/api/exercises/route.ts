import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { isWeightUnit, type WeightUnit } from "@/lib/units";
import { getExerciseSummary } from "@/lib/workout-stats";

// GET /api/exercises?q=bench
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const query = req.nextUrl.searchParams.get("q")?.trim();
  const displayUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  const exercises = await prisma.exercise.findMany({
    where: {
      userId: user.id,
      ...(query ? { name: { contains: query } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const withSummaries = await Promise.all(
    exercises.map(async (ex) => {
      const summary = await getExerciseSummary(user.id, ex.id, new Date(), displayUnit);
      return {
        ...ex,
        summary,
      };
    }),
  );

  return NextResponse.json({ exercises: withSummaries });
}
