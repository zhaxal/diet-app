-- Units become data instead of convention.
--
-- Before this, `User.weightUnit` was a display label: WeightLog.weight held a
-- bare number and switching kg to lb reinterpreted every historical reading
-- rather than re-rendering it. Weight is now canonical kilograms with the
-- entered unit stored beside it.
--
-- The backfill below is an ASSUMPTION: rows predating this migration are read
-- as having been entered in the account's CURRENT weightUnit, because that is
-- the unit they were being displayed in. It is correct for any account that
-- never switched the setting. An account that did switch has readings that were
-- already ambiguous, and no migration can recover which is which.

-- ── WeightLog: canonical kg + entered unit ────────────────────────────────
ALTER TABLE "WeightLog" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'kg';

UPDATE "WeightLog"
SET "unit" = (SELECT "weightUnit" FROM "User" WHERE "User"."id" = "WeightLog"."userId");

-- Pounds-entered rows are converted into the canonical column.
UPDATE "WeightLog"
SET "weight" = "weight" * 0.45359237
WHERE "unit" = 'lb';

-- ── FoodEntry: quantity carries its unit, and the row remembers its author ─
ALTER TABLE "FoodEntry" ADD COLUMN "quantity" REAL;
ALTER TABLE "FoodEntry" ADD COLUMN "quantityUnit" TEXT;
ALTER TABLE "FoodEntry" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ui';

-- `quantityGrams` was grams by name only: a 100ml product logged 250 "grams"
-- of milk. The value is carried across as-is and labelled with the unit its
-- product was measured in, which is the only correct reading of it.
UPDATE "FoodEntry"
SET "quantity" = "quantityGrams",
    "quantityUnit" = COALESCE(
      (SELECT CASE WHEN "Product"."basis" = '100ml' THEN 'ml' ELSE 'g' END
         FROM "Product" WHERE "Product"."id" = "FoodEntry"."productId"),
      'g'
    )
WHERE "quantityGrams" IS NOT NULL;

ALTER TABLE "FoodEntry" DROP COLUMN "quantityGrams";

-- Entries that predate the two front doors cannot be attributed, so they keep
-- the 'ui' default rather than claiming an origin the database never recorded.

-- ── Product: a serving is an amount in a unit, not always grams ───────────
ALTER TABLE "Product" ADD COLUMN "servingSize" REAL;
ALTER TABLE "Product" ADD COLUMN "servingUnit" TEXT;

UPDATE "Product"
SET "servingSize" = "servingGrams",
    "servingUnit" = CASE WHEN "basis" = '100ml' THEN 'ml' ELSE 'g' END
WHERE "servingGrams" IS NOT NULL;

ALTER TABLE "Product" DROP COLUMN "servingGrams";
