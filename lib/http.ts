import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function zodError(err: ZodError) {
  return NextResponse.json(
    {
      error: "Validation failed",
      details: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
    { status: 422 },
  );
}

export const unauthorized = () => jsonError("Unauthorized", 401);
export const notFound = () => jsonError("Not found", 404);

/** 429 with a Retry-After header, for a caller that has failed too many times. */
export function tooManyAttempts(retryAfterSec: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  const res = jsonError(
    `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    429,
  );
  res.headers.set("Retry-After", String(retryAfterSec));
  return res;
}
