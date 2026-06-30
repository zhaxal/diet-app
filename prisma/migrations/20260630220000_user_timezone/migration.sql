-- AlterTable: store each user's IANA timezone so day boundaries are computed locally
ALTER TABLE "User" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
