-- AlterTable: add apiKey column (empty default required by SQLite for NOT NULL)
ALTER TABLE "User" ADD COLUMN "apiKey" TEXT NOT NULL DEFAULT '';

-- Populate existing rows with a random 32-char hex string
UPDATE "User" SET "apiKey" = lower(hex(randomblob(16)));

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");
