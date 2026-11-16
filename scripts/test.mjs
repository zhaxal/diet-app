// Runs the unit tests against throwaway SQLite databases.
//
// The suite used to open whatever DATABASE_URL pointed at, which in practice
// was the developer's own dev.db: test accounts were written next to real ones,
// and a test that needs "no accounts exist yet" could not be written at all.
//
// Here the migrations are applied once to a template file, and tests/setup.mjs
// gives every test process its own copy of it. Nothing outside the temporary
// directory is read or written, and the directory is removed afterwards.
//
//   npm test                         run everything
//   npm test -- tests/time.test.ts   run one file

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "rationd-test-"));
const template = join(dir, "template.db");
let status = 1;

try {
  const migrate = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: `file:${template}` },
      encoding: "utf8",
    },
  );
  if (migrate.status !== 0) {
    process.stderr.write(migrate.stdout ?? "");
    process.stderr.write(migrate.stderr ?? "");
    throw new Error("Could not prepare the test database");
  }

  const files = process.argv.slice(2);
  const run = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      "./tests/setup.mjs",
      "--test",
      ...(files.length ? files : ["tests/*.test.ts"]),
    ],
    {
      env: { ...process.env, TEST_DB_DIR: dir, TEST_DB_TEMPLATE: template },
      stdio: "inherit",
    },
  );
  status = run.status ?? 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

process.exit(status);
