import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// The script runs in the container before migrations, so it is tested the way
// it is used: as a separate process, against real SQLite files on disk.

const REAL_MIGRATIONS = join(process.cwd(), "prisma", "migrations");

/** A fully migrated database in its own directory, as a deployed volume would hold. */
function volume() {
  const dir = mkdtempSync(join(tmpdir(), "rationd-backup-"));
  const db = join(dir, "diet.db");
  copyFileSync(process.env.TEST_DB_TEMPLATE as string, db);
  return { dir, db, backups: join(dir, "backups") };
}

/** The real migrations plus one the database has never seen. */
function migrationsWithOnePending() {
  const dir = mkdtempSync(join(tmpdir(), "rationd-migrations-"));
  for (const name of readdirSync(REAL_MIGRATIONS, { withFileTypes: true })) {
    if (name.isDirectory()) mkdirSync(join(dir, name.name));
  }
  mkdirSync(join(dir, "29990101000000_not_applied_yet"));
  return dir;
}

function run(env: Record<string, string>) {
  const res = spawnSync(process.execPath, ["scripts/backup-db.mjs"], {
    // Only what is passed in: the script must not pick up this process's database.
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", ...env },
    encoding: "utf8",
  });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

const snapshots = (dir: string) => (existsSync(dir) ? readdirSync(dir).sort() : []);

test("nothing is copied when every migration is already applied", () => {
  const v = volume();
  const res = run({ DATABASE_URL: `file:${v.db}`, MIGRATIONS_DIR: REAL_MIGRATIONS });
  assert.equal(res.status, 0, res.output);
  assert.deepEqual(snapshots(v.backups), []);
});

test("a pending migration gets a snapshot of the data as it stood", () => {
  const v = volume();
  const live = new DatabaseSync(v.db);
  live.exec(
    `INSERT INTO "User" ("id", "email", "passwordHash", "apiKey") VALUES ('u1', 'kept@example.com', 'x', 'k1')`,
  );
  live.close();

  const res = run({ DATABASE_URL: `file:${v.db}`, MIGRATIONS_DIR: migrationsWithOnePending() });
  assert.equal(res.status, 0, res.output);

  const made = snapshots(v.backups);
  assert.equal(made.length, 1);
  // The snapshot is a database in its own right, holding the row.
  const copy = new DatabaseSync(join(v.backups, made[0]), { readOnly: true });
  const rows = copy.prepare(`SELECT "email" FROM "User"`).all();
  copy.close();
  assert.deepEqual(rows.map((r) => r.email), ["kept@example.com"]);
});

test("only the five newest snapshots are kept", () => {
  const v = volume();
  mkdirSync(v.backups);
  const old = [1, 2, 3, 4, 5, 6, 7].map((day) => `diet-2026010${day}-000000.db`);
  for (const name of old) writeFileSync(join(v.backups, name), "old snapshot");

  const res = run({ DATABASE_URL: `file:${v.db}`, MIGRATIONS_DIR: migrationsWithOnePending() });
  assert.equal(res.status, 0, res.output);

  const kept = snapshots(v.backups);
  assert.equal(kept.length, 5);
  // The four most recent old ones survive alongside the one just made.
  assert.deepEqual(kept.slice(0, 4), old.slice(3));
  assert.equal(old.includes(kept[4]), false);
});

test("a fresh install with no database yet is left alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "rationd-backup-"));
  const res = run({ DATABASE_URL: `file:${join(dir, "diet.db")}`, MIGRATIONS_DIR: REAL_MIGRATIONS });
  assert.equal(res.status, 0, res.output);
  assert.deepEqual(readdirSync(dir), []);
});

test("a database that is not a SQLite file is not this script's business", () => {
  const res = run({ DATABASE_URL: "postgresql://db.internal/rationd", MIGRATIONS_DIR: REAL_MIGRATIONS });
  assert.equal(res.status, 0, res.output);
});

test("start-up stops if a needed snapshot cannot be written", () => {
  const v = volume();
  // A file where the backups folder has to go.
  writeFileSync(v.backups, "in the way");

  const blocked = run({ DATABASE_URL: `file:${v.db}`, MIGRATIONS_DIR: migrationsWithOnePending() });
  assert.notEqual(blocked.status, 0);

  // The operator can still choose to go ahead without one.
  const skipped = run({
    DATABASE_URL: `file:${v.db}`,
    MIGRATIONS_DIR: migrationsWithOnePending(),
    SKIP_DB_BACKUP: "1",
  });
  assert.equal(skipped.status, 0, skipped.output);
});
