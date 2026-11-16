// Preloaded into every test process by scripts/test.mjs, before any test file
// (and therefore before lib/prisma or lib/auth) is imported.
//
// Each process gets a private copy of the migrated template database, so tests
// in different files cannot see each other's rows and a test may assume the
// database starts empty.

import { copyFileSync } from "node:fs";
import { join } from "node:path";

const { TEST_DB_DIR, TEST_DB_TEMPLATE } = process.env;

if (!TEST_DB_DIR || !TEST_DB_TEMPLATE) {
  // Refuse to fall through to the DATABASE_URL in .env: that is a real database.
  throw new Error("Run the tests with `npm test`, which prepares a throwaway database.");
}

const db = join(TEST_DB_DIR, `test-${process.pid}.db`);
copyFileSync(TEST_DB_TEMPLATE, db);

process.env.DATABASE_URL = `file:${db}`;
process.env.JWT_SECRET = "test-only-secret";
