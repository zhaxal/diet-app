import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { goalsSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const data = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      dailyCalories: true,
      dailyProtein: true,
      dailyCarbs: true,
      dailyFat: true,
      weightUnit: true,
      timezone: true,
    },
  });

  return NextResponse.json({ goals: data });
}

export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = goalsSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: parsed.data,
    select: {
      dailyCalories: true,
      dailyProtein: true,
      dailyCarbs: true,
      dailyFat: true,
      weightUnit: true,
      timezone: true,
    },
  });

  return NextResponse.json({ goals: updated });
}
