import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, AUTH_COOKIE } from "@/lib/auth";
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
  const user = await prisma.user.findUnique({ where: { email } });

  // Use the same error for unknown email and bad password to avoid leaking
  // which accounts exist.
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return jsonError("Invalid email or password", 401);
  }

  const token = signToken({ id: user.id, email: user.email });

  const res = NextResponse.json({
    token,
    user: { id: user.id, email: user.email, createdAt: user.createdAt },
  });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
