import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail fast on a missing secret rather than silently signing with `undefined`.
  throw new Error("JWT_SECRET environment variable is not set");
}

// Long-lived tokens so a single login is practical for programmatic clients
// (e.g. Claude posting entries via the API).
const TOKEN_TTL = "30d";
export const AUTH_COOKIE = "diet_token";

export interface AuthUser {
  id: string;
  email: string;
}

interface TokenPayload {
  sub: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: AuthUser): string {
  const payload: TokenPayload = { sub: user.id, email: user.email };
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Resolve the authenticated user for a request. Accepts either an
 * `Authorization: Bearer <token>` header (preferred for API clients) or the
 * httpOnly auth cookie (used by the web UI). Returns null when unauthenticated.
 */
export async function getUserFromRequest(
  req: NextRequest,
): Promise<AuthUser | null> {
  let token: string | undefined;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    token = req.cookies.get(AUTH_COOKIE)?.value;
  }

  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  // Confirm the user still exists (e.g. not deleted after the token was issued).
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true },
  });

  return user;
}
