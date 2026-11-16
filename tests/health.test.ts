import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { GET as health } from "../app/api/health/route";

test("health reports ok without signing in while the database answers", async () => {
  const res = await health();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

// Last in the file on purpose: it destroys this process's private database.
test("health reports 503, and nothing else, when the database cannot be read", async (t) => {
  const dbFile = (process.env.DATABASE_URL as string).replace(/^file:/, "");
  await prisma.$disconnect();
  writeFileSync(dbFile, "this is not a database");
  // The route logs the real reason for the operator; keep it out of the test output.
  t.mock.method(console, "error", () => {});

  const res = await health();
  assert.equal(res.status, 503);
  // Exactly this: the reason stays in the server log, away from a public caller.
  assert.deepEqual(await res.json(), { ok: false });
});
