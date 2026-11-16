import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/health — is this instance able to serve requests?
//
// Public and deliberately terse: it is polled by the container's healthcheck
// and by whatever proxy sits in front, neither of which can sign in. "Able to
// serve" means the database answers, since nothing in the app works without it.
export async function GET() {
  try {
    // A real read of a real table. `SELECT 1` proves nothing on SQLite: it
    // never opens the file, so it succeeds against a missing or corrupt one.
    await prisma.user.findFirst({ select: { id: true } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // The reason goes to the server log, not to an unauthenticated caller.
    console.error("Health check failed:", err);
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
