import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { applyTemplateSchema, templateItemSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized, notFound } from "@/lib/http";
import { zonedWallToUtc } from "@/lib/time";
import { z } from "zod";

// POST /api/templates/[id]/apply { date } — create entries for `date` from the template.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const tpl = await prisma.mealTemplate.findUnique({ where: { id } });
  if (!tpl || tpl.userId !== user.id) return notFound();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = applyTemplateSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const items = z.array(templateItemSchema).safeParse(JSON.parse(tpl.items));
  if (!items.success || items.data.length === 0) {
    return jsonError("Template has no valid items", 422);
  }

  const consumedAt = zonedWallToUtc(parsed.data.date, "12:00:00.000", user.timezone);

  await prisma.foodEntry.createMany({
    data: items.data.map((it) => ({ userId: user.id, ...it, consumedAt })),
  });

  return NextResponse.json({ added: items.data.length });
}
