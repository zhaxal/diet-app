import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { jsonError, unauthorized } from "@/lib/http";
import { isWeightUnit, type WeightUnit } from "@/lib/units";
import { getExerciseFullHistory } from "@/lib/workout-stats";

// GET /api/exercises/[id]/history
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const displayUnit: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";

  const history = await getExerciseFullHistory(user.id, id, displayUnit);
  if (!history) {
    return jsonError("Exercise not found", 404);
  }

  return NextResponse.json(history);
}
