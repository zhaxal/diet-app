-- Reference nutrition data, stored per 100 g/ml (the basis macro tables use).
-- Populated from nutrition-label photos via MCP so a product is read once and
-- re-logged thereafter without re-photographing it.
CREATE TABLE "Product" (
    "id"           TEXT     NOT NULL PRIMARY KEY,
    "userId"       TEXT     NOT NULL,
    "name"         TEXT     NOT NULL,
    "brand"        TEXT,
    "barcode"      TEXT,
    "basis"        TEXT     NOT NULL DEFAULT '100g',
    "calories"     REAL     NOT NULL,
    "protein"      REAL     NOT NULL DEFAULT 0,
    "carbs"        REAL     NOT NULL DEFAULT 0,
    "fat"          REAL     NOT NULL DEFAULT 0,
    "fiber"        REAL     NOT NULL DEFAULT 0,
    "sugar"        REAL     NOT NULL DEFAULT 0,
    "sodium"       REAL     NOT NULL DEFAULT 0,
    "servingGrams" REAL,
    "source"       TEXT     NOT NULL DEFAULT 'manual',
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- SQLite treats NULLs as distinct, so products without a barcode are unaffected.
CREATE UNIQUE INDEX "Product_userId_barcode_key" ON "Product"("userId", "barcode");
CREATE INDEX "Product_userId_name_idx" ON "Product"("userId", "name");

-- Provenance on entries logged from a saved product. Macros stay denormalised
-- on the entry so history is stable if the product is later edited or deleted.
ALTER TABLE "FoodEntry" ADD COLUMN "productId" TEXT;
ALTER TABLE "FoodEntry" ADD COLUMN "quantityGrams" REAL;
