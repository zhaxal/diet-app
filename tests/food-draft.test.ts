import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { clearFoodDrafts, clearFoodDraftsUnless, readFoodDraft, writeFoodDraft, type FoodDraft } from "../lib/food-draft";

let data: Map<string, string>;
beforeEach(() => {
  clearFoodDrafts();
  data = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  } });
});
const draft: FoodDraft = {
  q: "", name: "Oatmeal", vals: { calories: "320", protein: "12", carbs: "54", fat: "6", fiber: "8", sugar: "10", sodium: "120" },
  reference: { kind: "per", amount: 100, unit: "g" }, amount: "200", unit: "g", multiple: "1", serving: null,
  productId: null, origin: null, showTrace: true, meal: "breakfast",
};
test("drafts retain the intended meal and remain separate for each day", () => {
  writeFoodDraft("owner", "2026-09-06", draft);
  writeFoodDraft("owner", "2026-09-05", { ...draft, name: "Rice", meal: "dinner" });
  assert.deepEqual(readFoodDraft("owner", "2026-09-06"), draft);
  assert.equal(readFoodDraft("owner", "2026-09-05")?.meal, "dinner");
  assert.equal(readFoodDraft("someone-else", "2026-09-06"), null);
});
test("an unfinished historical draft does not invent a meal", () => {
  const unresolved = { ...draft, meal: null };
  writeFoodDraft("owner", "2026-09-05", unresolved);
  assert.deepEqual(readFoodDraft("owner", "2026-09-05"), unresolved);
});
test("persisted drafts restore their nutrition basis after a fresh session", () => {
  writeFoodDraft("owner", "2026-09-06", draft);
  const stored = data.get("diet.food-drafts.v1")!;
  clearFoodDrafts();
  data.set("diet.food-drafts.v1", stored);
  assert.deepEqual(readFoodDraft("owner", "2026-09-06"), draft);
});
test("discard and successful logging clear only the current day's draft", () => {
  writeFoodDraft("owner", "2026-09-06", draft);
  writeFoodDraft("owner", "2026-09-05", draft);
  writeFoodDraft("owner", "2026-09-06", null);
  assert.equal(readFoodDraft("owner", "2026-09-06"), null);
  assert.deepEqual(readFoodDraft("owner", "2026-09-05"), draft);
});
test("account changes and logout clear stored drafts", () => {
  writeFoodDraft("owner", "2026-09-06", draft);
  clearFoodDraftsUnless("new-owner");
  assert.equal(readFoodDraft("owner", "2026-09-06"), null);
  writeFoodDraft("new-owner", "2026-09-06", draft);
  clearFoodDrafts();
  assert.equal(readFoodDraft("new-owner", "2026-09-06"), null);
});
test("unavailable storage retains a session draft and malformed storage is ignored", () => {
  data.set("diet.food-drafts.v1", "not json");
  assert.equal(readFoodDraft("owner", "2026-09-06"), null);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  writeFoodDraft("owner", "2026-09-06", draft);
  assert.deepEqual(readFoodDraft("owner", "2026-09-06"), draft);
});
