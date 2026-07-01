import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { templateSchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized } from "@/lib/http";

// GET /api/templates — list the user's meal templates (items parsed from JSON).
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const rows = await prisma.mealTemplate.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const templates = rows.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt,
    items: safeParse(t.items),
  }));

  return NextResponse.json({ templates });
}

// POST /api/templates { name, items[] } — create a template.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const created = await prisma.mealTemplate.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      items: JSON.stringify(parsed.data.items),
    },
  });

  return NextResponse.json(
    { template: { id: created.id, name: created.name, createdAt: created.createdAt, items: parsed.data.items } },
    { status: 201 },
  );
}

function safeParse(json: string): unknown[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
