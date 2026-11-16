import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, AUTH_COOKIE } from "@/lib/auth";
import { generateApiKey } from "@/lib/api-key";
import { registerSchema } from "@/lib/validation";
import { jsonError, tooManyAttempts, zodError } from "@/lib/http";
import { clientFailures, clientIp } from "@/lib/rate-limit";
import { inviteCodeMatches, registrationState } from "@/lib/registration";

// GET /api/auth/register — whether this server is taking new accounts, and
// whether an invite code is needed. Public: the sign-up form reads it before
// anyone is signed in, and it reveals nothing the form's own response would not.
export async function GET() {
  return NextResponse.json(await registrationState());
}

export async function POST(req: NextRequest) {
  const ipKey = `ip:${clientIp(req)}`;
  const limit = clientFailures.check(ipKey);
  if (!limit.allowed) return tooManyAttempts(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const state = await registrationState();
  if (!state.open) {
    return jsonError("Registration is closed on this server", 403);
  }
  if (state.inviteRequired && !inviteCodeMatches(parsed.data.inviteCode)) {
    // Counted, so the code cannot be found by trying them all.
    clientFailures.hit(ipKey);
    return jsonError("That invite code is not valid", 403);
  }

  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return jsonError("An account with this email already exists", 409);
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(parsed.data.password),
      apiKey: generateApiKey(),
    },
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
