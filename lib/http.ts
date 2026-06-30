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

/**
 * Given a YYYY-MM-DD string, return the [start, end) UTC instants that bound
 * that calendar day. Used to filter entries by day.
 */
export function dayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
