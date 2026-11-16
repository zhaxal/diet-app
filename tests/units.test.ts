import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatQuantity,
  fromKg,
  normaliseQuantity,
  normaliseServing,
  scaleFactor,
  toBase,
  toKg,
  unitsFor,
} from "../lib/units";
import { hasTrace, parseMacros, scaleMacros } from "../lib/macros";

const close = (actual: number | null, expected: number) => {
  assert.ok(actual !== null, "expected a number, got null");
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
};

// ── Body weight ────────────────────────────────────────────────────────────

test("pounds are stored as kilograms and kilograms pass through", () => {
  close(toKg(220, "lb"), 99.7903214); // 220 × 0.45359237
  assert.equal(toKg(80, "kg"), 80);
});

test("kilograms are shown in the chosen unit to one decimal", () => {
  assert.equal(fromKg(100, "lb"), 220.5); // 220.462… rounds to 220.5
  assert.equal(fromKg(72.34, "kg"), 72.3);
});

// ── Food quantity ──────────────────────────────────────────────────────────

test("a quantity resolves to the product's base unit", () => {
  assert.equal(toBase(200, "g", "100g"), 200);
  close(toBase(2, "oz", "100g"), 56.69904625); // 2 × 28.349523125
  close(toBase(1, "floz", "100ml"), 29.5735295625);
});

test("a volume of a product measured by weight has no answer", () => {
  assert.equal(toBase(200, "ml", "100g"), null);
  assert.equal(toBase(200, "g", "100ml"), null);
});

test("servings resolve through the product's declared serving size", () => {
  assert.equal(toBase(2, "serving", "100g", { size: 30, unit: "g" }), 60);
  // No declared size: a serving cannot be turned into grams.
  assert.equal(toBase(1, "serving", "100g", null), null);
  // A serving stated in millilitres does not fit a per-100g product.
  assert.equal(toBase(1, "serving", "100g", { size: 250, unit: "ml" }), null);
});

test("zero, negative and non-finite quantities are refused", () => {
  assert.equal(toBase(0, "g", "100g"), null);
  assert.equal(toBase(-5, "g", "100g"), null);
  assert.equal(toBase(Number.NaN, "g", "100g"), null);
});

test("the entry units offered match how the product is measured", () => {
  assert.deepEqual(unitsFor("100g", false), ["g", "oz"]);
  assert.deepEqual(unitsFor("100ml", true), ["ml", "floz", "serving"]);
});

test("nutrition quoted for one amount scales to another of the same dimension", () => {
  close(scaleFactor({ amount: 300, unit: "g" }, { amount: 250, unit: "g" }), 1.2);
  close(scaleFactor({ amount: 1, unit: "oz" }, { amount: 100, unit: "g" }), 0.28349523125);
  close(scaleFactor({ amount: 2, unit: "serving" }, { amount: 1, unit: "serving" }), 2);
  // One 30 g serving against a figure quoted per 100 g.
  close(
    scaleFactor({ amount: 1, unit: "serving" }, { amount: 100, unit: "g" }, { size: 30, unit: "g" }),
    0.3,
  );
});

test("amounts in different dimensions cannot be scaled against each other", () => {
  assert.equal(scaleFactor({ amount: 200, unit: "ml" }, { amount: 100, unit: "g" }), null);
  // A serving of unknown size against grams.
  assert.equal(scaleFactor({ amount: 1, unit: "serving" }, { amount: 100, unit: "g" }), null);
  assert.equal(scaleFactor({ amount: 0, unit: "g" }, { amount: 100, unit: "g" }), null);
});

test("the old quantityGrams field becomes a quantity in grams", () => {
  assert.deepEqual(normaliseQuantity({ quantityGrams: 150 }), { quantity: 150, quantityUnit: "g" });
  assert.deepEqual(normaliseQuantity({ quantity: 2, quantityUnit: "serving" }), {
    quantity: 2,
    quantityUnit: "serving",
  });
  // A bare quantity is grams; the new field wins when both are sent.
  assert.deepEqual(normaliseQuantity({ quantity: 5 }), { quantity: 5, quantityUnit: "g" });
  assert.deepEqual(normaliseQuantity({ quantity: 5, quantityUnit: "oz", quantityGrams: 150 }), {
    quantity: 5,
    quantityUnit: "oz",
  });
  assert.deepEqual(normaliseQuantity({}), { quantity: null, quantityUnit: null });
});

test("a serving without a unit takes the product's base unit", () => {
  assert.deepEqual(normaliseServing({ servingGrams: 30 }, "100ml"), {
    servingSize: 30,
    servingUnit: "ml",
  });
  assert.deepEqual(normaliseServing({ servingSize: 40 }, "100g"), {
    servingSize: 40,
    servingUnit: "g",
  });
  assert.deepEqual(normaliseServing({ servingSize: 1, servingUnit: "oz" }, "100g"), {
    servingSize: 1,
    servingUnit: "oz",
  });
  assert.deepEqual(normaliseServing({}, "100g"), { servingSize: null, servingUnit: null });
});

test("quantities read the way each unit is written", () => {
  assert.equal(formatQuantity(250, "ml"), "250ml");
  assert.equal(formatQuantity(8, "floz"), "8 fl oz");
  assert.equal(formatQuantity(1, "serving"), "1 serving");
  assert.equal(formatQuantity(2, "serving"), "2 servings");
  assert.equal(formatQuantity(33.333, "g"), "33.33g");
});

// ── Macros ─────────────────────────────────────────────────────────────────

const chicken = { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0, sodium: 74 };

test("scaling keeps calories and sodium whole and grams to one decimal", () => {
  assert.deepEqual(scaleMacros(chicken, 2), {
    calories: 330, protein: 62, carbs: 0, fat: 7.2, fiber: 0, sugar: 0, sodium: 148,
  });
  assert.deepEqual(scaleMacros(chicken, 0.5), {
    calories: 83, protein: 15.5, carbs: 0, fat: 1.8, fiber: 0, sugar: 0, sodium: 37,
  });
});

test("a factor that is not a positive number leaves the figures as they were", () => {
  for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(scaleMacros(chicken, factor), chicken);
  }
});

test("blank, negative and non-numeric form fields read as zero", () => {
  assert.deepEqual(
    parseMacros({
      calories: "250.6", protein: "12.5", carbs: "", fat: "abc", fiber: "-5", sugar: "0", sodium: "120",
    }),
    { calories: 251, protein: 12.5, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 120 },
  );
});

test("trace nutrients are detected only beyond the four headline figures", () => {
  assert.equal(hasTrace(chicken), true); // sodium 74
  assert.equal(hasTrace({ ...chicken, sodium: 0 }), false);
});
