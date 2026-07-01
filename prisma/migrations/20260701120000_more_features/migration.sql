-- Extra nutrients on food entries
ALTER TABLE "FoodEntry" ADD COLUMN "fiber"  REAL NOT NULL DEFAULT 0;
ALTER TABLE "FoodEntry" ADD COLUMN "sugar"  REAL NOT NULL DEFAULT 0;
ALTER TABLE "FoodEntry" ADD COLUMN "sodium" REAL NOT NULL DEFAULT 0;

-- Extra nutrients on favorites
ALTER TABLE "Favorite" ADD COLUMN "fiber"  REAL NOT NULL DEFAULT 0;
ALTER TABLE "Favorite" ADD COLUMN "sugar"  REAL NOT NULL DEFAULT 0;
ALTER TABLE "Favorite" ADD COLUMN "sodium" REAL NOT NULL DEFAULT 0;

-- Extra-nutrient goals + TDEE profile on the user
ALTER TABLE "User" ADD COLUMN "dailyFiber"  REAL;
ALTER TABLE "User" ADD COLUMN "dailySugar"  REAL;
ALTER TABLE "User" ADD COLUMN "dailySodium" REAL;
ALTER TABLE "User" ADD COLUMN "sex"         TEXT;
ALTER TABLE "User" ADD COLUMN "birthYear"   INTEGER;
ALTER TABLE "User" ADD COLUMN "heightCm"    REAL;

-- Meal templates (items stored as a JSON string)
CREATE TABLE "MealTemplate" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "userId"    TEXT     NOT NULL,
    "name"      TEXT     NOT NULL,
    "items"     TEXT     NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MealTemplate_userId_idx" ON "MealTemplate"("userId");
