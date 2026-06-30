-- AlterTable: add goal fields and weight unit to User
ALTER TABLE "User" ADD COLUMN "dailyCalories" INTEGER;
ALTER TABLE "User" ADD COLUMN "dailyProtein"  REAL;
ALTER TABLE "User" ADD COLUMN "dailyCarbs"    REAL;
ALTER TABLE "User" ADD COLUMN "dailyFat"      REAL;
ALTER TABLE "User" ADD COLUMN "weightUnit"    TEXT NOT NULL DEFAULT 'kg';

-- CreateTable: WeightLog
CREATE TABLE "WeightLog" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "userId"    TEXT     NOT NULL,
    "weight"    REAL     NOT NULL,
    "loggedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeightLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: Favorite
CREATE TABLE "Favorite" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "userId"    TEXT     NOT NULL,
    "name"      TEXT     NOT NULL,
    "calories"  INTEGER  NOT NULL,
    "protein"   REAL     NOT NULL DEFAULT 0,
    "carbs"     REAL     NOT NULL DEFAULT 0,
    "fat"       REAL     NOT NULL DEFAULT 0,
    "mealType"  TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WeightLog_userId_loggedAt_idx" ON "WeightLog"("userId", "loggedAt");
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");
