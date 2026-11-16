-- AlterTable: a per-user session version, so changing a password can sign out
-- every session issued before it. Existing tokens carry no version and are read
-- as 0, which matches the default here — nobody is signed out by this migration.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
