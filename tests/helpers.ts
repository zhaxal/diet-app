// Shared plumbing for tests that call route handlers directly.
//
// Handlers are invoked as plain functions with a real NextRequest and a real
// (throwaway) database — see tests/setup.mjs. Nothing here is mocked.

import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { hashPassword, signToken } from "../lib/auth";

export const ORIGIN = "http://localhost:3000";

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

/** A real account row plus a session token for it. */
export async function createUser(
  email: string,
  opts: { timezone?: string; password?: string } = {},
): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(opts.password ?? "correct-horse-battery"),
      timezone: opts.timezone ?? "UTC",
    },
  });
  return { id: user.id, email: user.email, token: signToken(user) };
}

export function request(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

/** The second argument Next passes to a dynamic `[id]` route handler. */
export const withId = (id: string) => ({ params: Promise.resolve({ id }) });
