import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, AUTH_COOKIE } from "@/lib/auth";
import { credentialsSchema } from "@/lib/validation";
import { jsonError, zodError } from "@/lib/http";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return jsonError("An account with this email already exists", 409);
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(parsed.data.password) },
    select: { id: true, email: true, createdAt: true },
  });

  const token = signToken({ id: user.id, email: user.email });

  const res = NextResponse.json({ token, user }, { status: 201 });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
