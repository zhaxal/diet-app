import { test } from "node:test";
import assert from "node:assert/strict";
import { resizePortion, restateAmount } from "../lib/entry-portion";

const entry = { quantity: 200, quantityUnit: "g" as const, calories: 320, protein: 12, carbs: 54, fat: 6, fiber: 8, sugar: 10, sodium: 120 };

test("halving a recorded portion scales all seven nutrition totals", () => {
  assert.deepEqual(resizePortion(entry, 100, "g"), { calories: 160, protein: 6, carbs: 27, fat: 3, fiber: 4, sugar: 5, sodium: 60 });
  assert.equal(entry.calories, 320);
});
test("changing display units preserves the portion and nutrition", () => {
  const ounces = restateAmount("200", "g", "oz");
  assert.ok(Math.abs(Number(ounces) - 7.054792) < 0.000001);
  assert.deepEqual(resizePortion(entry, Number(ounces), "oz"), resizePortion(entry, 200, "g"));
  assert.ok(Math.abs(Number(restateAmount(ounces, "oz", "g")) - 200) < 0.00002);
});
test("volume conversion and same-unit servings work without guessing a density", () => {
  assert.equal(restateAmount("29.5735295625", "ml", "floz"), "1");
  assert.equal(resizePortion({ ...entry, quantity: 2, quantityUnit: "serving" }, 1, "serving")?.calories, 160);
  assert.equal(resizePortion(entry, 200, "ml"), null);
});
test("missing and invalid amounts cannot silently reuse unscaled nutrition", () => {
  for (const quantity of [0, -1, NaN, Infinity]) assert.equal(resizePortion(entry, quantity, "g"), null);
  assert.equal(resizePortion({ ...entry, quantity: null }, 100, "g"), null);
  assert.equal(restateAmount("", "g", "oz"), "");
});
test("each preview scales the original reading so repeated editing does not accumulate rounding", () => {
  resizePortion(entry, 3, "g");
  resizePortion(entry, 199, "g");
  assert.deepEqual(resizePortion(entry, 200, "g"), { calories: 320, protein: 12, carbs: 54, fat: 6, fiber: 8, sugar: 10, sodium: 120 });
});
