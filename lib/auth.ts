import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail fast on a missing secret rather than silently signing with `undefined`.
  throw new Error("JWT_SECRET environment variable is not set");
}

// Long-lived tokens so a single login is practical for programmatic clients
// (e.g. AI assistants posting entries via MCP or the API).
const TOKEN_TTL = "30d";
export const AUTH_COOKIE = "diet_token";

export interface AuthUser {
  id: string;
  email: string;
  timezone: string;
  /** The account's display unit for body weight. Storage is always kilograms. */
  weightUnit: string;
}

interface TokenPayload {
  sub: string;
  email: string;
  /**
   * The account's `tokenVersion` when this token was issued. Tokens from before
   * the field existed have none, and are read as version 0.
   */
  v?: number;
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

export function signToken(user: {
  id: string;
  email: string;
  tokenVersion?: number;
}): string {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    v: user.tokenVersion ?? 0,
  };
  return jwt.sign(payload, JWT_SECRET as string, {
    algorithm: "HS256",
    expiresIn: TOKEN_TTL,
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string, {
      algorithms: ["HS256"],
    }) as TokenPayload;
  } catch {
    return null;
  }
}

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function setAuthCookie(res: NextResponse, token: string): void {
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  });
}

export function clearAuthCookie(res: NextResponse): void {
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
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
  const found = await prisma.user.findUnique({
    where: { id: payload.sub },
    // weightUnit rides along because body weight is stored canonically and
    // every read has to render it in the account's own unit.
    select: { id: true, email: true, timezone: true, weightUnit: true, tokenVersion: true },
  });
  if (!found) return null;

  // A token issued before the password last changed is no longer a session.
  const { tokenVersion, ...user } = found;
  if ((payload.v ?? 0) !== tokenVersion) return null;

  return user;
}
