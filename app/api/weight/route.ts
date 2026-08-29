import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { weightSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";
import { fromKg, isWeightUnit, toKg, type WeightUnit } from "@/lib/units";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");

  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const to = toParam ? new Date(toParam) : now;

  const logs = await prisma.weightLog.findMany({
    where: { userId: user.id, loggedAt: { gte: from, lte: to } },
    orderBy: { loggedAt: "asc" },
  });

  // The column is canonical kilograms; the response speaks the account's unit.
  // Both are sent, so a caller never has to guess which one it received.
  const display: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";
  return NextResponse.json({
    unit: display,
    logs: logs.map((l) => ({
      ...l,
      weight: fromKg(l.weight, display),
      weightKg: l.weight,
      enteredUnit: l.unit,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = weightSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  // The unit is whatever the caller said, falling back to the account's setting.
  // It is recorded on the row so the reading stays the same measurement even if
  // the setting later changes.
  const entered: WeightUnit = parsed.data.unit ?? (isWeightUnit(user.weightUnit) ? user.weightUnit : "kg");

  const log = await prisma.weightLog.create({
    data: {
      userId: user.id,
      weight: toKg(parsed.data.weight, entered),
      unit: entered,
      loggedAt: parsed.data.loggedAt ? new Date(parsed.data.loggedAt) : undefined,
    },
  });

  const display: WeightUnit = isWeightUnit(user.weightUnit) ? user.weightUnit : "kg";
  return NextResponse.json(
    {
      log: { ...log, weight: fromKg(log.weight, display), weightKg: log.weight, enteredUnit: log.unit },
      unit: display,
    },
    { status: 201 },
  );
}
