// Snapshot the SQLite database before a migration changes it.
//
// The container applies pending migrations every time it starts, so a bad
// migration would otherwise reach the only copy of the data unattended. This
// runs first: if any migration in the image has not been applied yet, it writes
// a consistent copy of the database next to it and keeps the newest few.
//
// It protects against a migration going wrong, not against losing the disk —
// the snapshots live on the same volume as the database.
//
//   DATABASE_URL      file:/app/data/diet.db   (anything else is skipped)
//   MIGRATIONS_DIR    default prisma/migrations
//   DB_BACKUP_KEEP    how many snapshots to keep, default 5
//   SKIP_DB_BACKUP=1  start without a snapshot even if one could not be made
//
// Plain .mjs with no dependencies, because it runs in the production image
// where only the built app and the Prisma CLI exist.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";

const log = (msg) => console.log(`[backup] ${msg}`);

function databaseFile() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  const path = url.slice("file:".length).split("?")[0];
  // Prisma resolves a relative SQLite path against the schema's directory.
  return isAbsolute(path) ? path : resolve("prisma", path);
}

function migrationsInImage() {
  const dir = process.env.MIGRATIONS_DIR ?? join("prisma", "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function appliedMigrations(db) {
  try {
    return db
      .prepare(
        `SELECT "migration_name" AS name FROM "_prisma_migrations"
          WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
      )
      .all()
      .map((row) => row.name);
  } catch {
    // No migrations table: nothing recorded as applied.
    return [];
  }
}

function timestamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `-${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
  );
}

function parseSnapshotName(name, prefix) {
  const stem = name.slice(prefix.length, -".db".length);
  const match = stem.match(/^(\d{8}-\d{6})(?:-(\d+))?$/);
  if (!match) return null;
  return {
    base: match[1],
    seq: match[2] ? Number.parseInt(match[2], 10) : 1,
  };
}

function compareSnapshots(prefix) {
  return (a, b) => {
    const pa = parseSnapshotName(a, prefix);
    const pb = parseSnapshotName(b, prefix);
    if (pa && pb) {
      if (pa.base !== pb.base) return pa.base < pb.base ? -1 : 1;
      if (pa.seq !== pb.seq) return pa.seq - pb.seq;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

async function main() {
  const file = databaseFile();
  if (!file) return log("DATABASE_URL is not a SQLite file; nothing to do.");
  if (!existsSync(file) || statSync(file).size === 0) {
    return log("No database yet; nothing to back up.");
  }

  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    const applied = new Set(appliedMigrations(db));
    const pending = migrationsInImage().filter((name) => !applied.has(name));
    if (pending.length === 0) return log("Database is up to date; no snapshot needed.");

    const dir = join(dirname(file), "backups");
    mkdirSync(dir, { recursive: true });

    // Named so that sorting by timestamp + collision suffix is sorting by time.
    const stem = basename(file, extname(file));
    const prefix = `${stem}-`;
    const now = new Date();
    const stamp = timestamp(now);
    let target = join(dir, `${prefix}${stamp}.db`);
    for (let n = 2; existsSync(target); n++) {
      target = join(dir, `${prefix}${stamp}-${n}.db`);
    }

    // VACUUM INTO writes a complete, consistent database file, including
    // anything still sitting in a journal — a plain file copy would not.
    // Stage through a temp file and rename atomically so a crash never leaves a half-written .db.
    const tmpTarget = `${target}.tmp.${process.pid}`;
    try {
      db.exec(`VACUUM INTO '${tmpTarget.replaceAll("'", "''")}'`);
      renameSync(tmpTarget, target);
    } catch (err) {
      if (existsSync(tmpTarget)) {
        try {
          unlinkSync(tmpTarget);
        } catch {
          // ignore cleanup failure
        }
      }
      throw err;
    }
    log(`${pending.length} pending migration(s); snapshot written to ${target}`);

    const keep = Math.max(1, Number.parseInt(process.env.DB_BACKUP_KEEP ?? "5", 10) || 5);
    const snapshots = readdirSync(dir)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".db"))
      .sort(compareSnapshots(prefix));
    for (const name of snapshots.slice(0, Math.max(0, snapshots.length - keep))) {
      unlinkSync(join(dir, name));
      log(`Removed old snapshot ${name}`);
    }
  } finally {
    db.close();
  }
}

try {
  await main();
} catch (err) {
  console.error(`[backup] Could not snapshot the database: ${err?.message ?? err}`);
  if (process.env.SKIP_DB_BACKUP === "1") {
    console.error("[backup] SKIP_DB_BACKUP=1 is set; continuing without a snapshot.");
  } else {
    console.error(
      "[backup] Not starting, so that migrations do not run against data with no copy. " +
        "Fix the cause, or set SKIP_DB_BACKUP=1 to start anyway.",
    );
    process.exit(1);
  }
}
