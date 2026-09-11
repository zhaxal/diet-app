import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { isWeightUnit, type WeightUnit } from "@/lib/units";
import { getWorkoutMacroSummary } from "@/lib/workout-stats";

// GET /api/workouts/summary?days=30
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam ? Math.max(1, Math.min(365, parseInt(daysParam, 10) || 30)) : 30;
  const displayUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  const summary = await getWorkoutMacroSummary(user.id, days, displayUnit);

  return NextResponse.json({ summary });
}
