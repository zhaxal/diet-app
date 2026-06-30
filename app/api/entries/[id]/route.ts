import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { updateEntrySchema } from "@/lib/validation";
import { jsonError, zodError, unauthorized, notFound } from "@/lib/http";

// Confirm the entry exists AND belongs to the requesting user.
async function ownedEntry(userId: string, id: string) {
  const entry = await prisma.foodEntry.findUnique({ where: { id } });
  if (!entry || entry.userId !== userId) return null;
  return entry;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const entry = await ownedEntry(user.id, id);
  if (!entry) return notFound();

  return NextResponse.json({ entry });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const existing = await ownedEntry(user.id, id);
  if (!existing) return notFound();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = updateEntrySchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { consumedAt, ...rest } = parsed.data;
  const entry = await prisma.foodEntry.update({
    where: { id },
    data: {
      ...rest,
      ...(consumedAt ? { consumedAt: new Date(consumedAt) } : {}),
    },
  });

  return NextResponse.json({ entry });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const existing = await ownedEntry(user.id, id);
  if (!existing) return notFound();

  await prisma.foodEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
