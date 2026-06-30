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
