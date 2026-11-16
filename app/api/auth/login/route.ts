import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, AUTH_COOKIE } from "@/lib/auth";
import { credentialsSchema } from "@/lib/validation";
import { jsonError, tooManyAttempts, zodError } from "@/lib/http";
import { clientFailures, clientIp, loginFailures } from "@/lib/rate-limit";

// A well-formed bcrypt hash of nothing in particular. An unknown email is
// checked against it so that rejecting one costs the same as rejecting a wrong
// password — otherwise the response time says which addresses have accounts.
const DECOY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8rNPJPZdcWBwFLGLFlKzAFgwBvTt7W";

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

  // Two buckets: this address against this account, and this address overall.
  // Neither is keyed on the account alone, so a stranger hammering someone's
  // email cannot lock its owner out from another address.
  const ip = clientIp(req);
  const ipKey = `ip:${ip}`;
  const accountKey = `login:${ip}:${email}`;
  for (const limit of [clientFailures.check(ipKey), loginFailures.check(accountKey)]) {
    if (!limit.allowed) return tooManyAttempts(limit.retryAfterSec);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk = await verifyPassword(parsed.data.password, user?.passwordHash ?? DECOY_HASH);

  // Use the same error for unknown email and bad password to avoid leaking
  // which accounts exist.
  if (!user || !passwordOk) {
    clientFailures.hit(ipKey);
    loginFailures.hit(accountKey);
    return jsonError("Invalid email or password", 401);
  }

  loginFailures.reset(accountKey);

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
