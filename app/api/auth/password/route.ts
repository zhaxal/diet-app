import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserFromRequest,
  hashPassword,
  setAuthCookie,
  signToken,
  verifyPassword,
} from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { jsonError, tooManyAttempts, unauthorized, zodError } from "@/lib/http";
import { clientFailures, clientIp, loginFailures } from "@/lib/rate-limit";

// POST /api/auth/password { currentPassword, newPassword }
//
// Changes the signed-in account's password and ends every session issued
// before the change, on every device. The caller gets a fresh session back, so
// the device that made the change stays signed in.
//
// The API key is a separate credential and is deliberately left alone: a
// password change should not silently disconnect the assistant. Rotating the
// key is its own action (POST /api/auth/apikey).
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  // Asking for the current password is what stops a borrowed, unlocked phone
  // from taking the account over — so guesses at it are limited like sign-ins.
  const ipKey = `ip:${clientIp(req)}`;
  const accountKey = `password:${clientIp(req)}:${user.id}`;
  for (const limit of [clientFailures.check(ipKey), loginFailures.check(accountKey)]) {
    if (!limit.allowed) return tooManyAttempts(limit.retryAfterSec);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!(await verifyPassword(parsed.data.currentPassword, passwordHash))) {
    clientFailures.hit(ipKey);
    loginFailures.hit(accountKey);
    // 403, not 401: the session is fine, it is this one request that is refused.
    return jsonError("Current password is incorrect", 403);
  }
  loginFailures.reset(accountKey);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      tokenVersion: { increment: 1 },
    },
    select: { id: true, email: true, tokenVersion: true },
  });

  const token = signToken(updated);
  const res = NextResponse.json({ ok: true, token });
  setAuthCookie(res, token);
  return res;
}
