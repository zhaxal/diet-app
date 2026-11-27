import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { addManyToTray, clearTray, readTray } from "../lib/copied";
import { lookupMuscleGroup } from "../lib/default-exercises";
import { clearSnapshot, readSnapshot, writeSnapshot } from "../lib/offline-cache";
import { rankRecent } from "../lib/quick-add-rank";
import { shiftDate, stripEnding } from "../lib/time-client";
import {
  clearAllWorkoutDrafts,
  clearWorkoutDraftsUnless,
  clearWorkoutSessionCache,
  getCachedWorkout,
  readWorkoutDraft,
  setCachedWorkout,
  writeWorkoutDraft,
} from "../lib/workout-cache";

let store: Map<string, string>;

function installStorage() {
  store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
  });
}

beforeEach(() => {
  clearTray();
  clearWorkoutSessionCache();
  installStorage();
  clearSnapshot();
  clearAllWorkoutDrafts();
});

test("addManyToTray preserves input order newest-first and falls back when storage throws", () => {
  const base = {
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 2,
    fiber: 1,
    sugar: 1,
    sodium: 50,
    mealType: "lunch",
    productId: null,
    quantity: null,
    quantityUnit: null,
    fromDate: "2026-10-01",
  };

  const items = addManyToTray("u1", [
    { ...base, name: "First" },
    { ...base, name: "Second" },
    { ...base, name: "Third" },
  ]);
  assert.deepEqual(
    items.map((i) => i.name),
    ["First", "Second", "Third"],
  );

  // Throw on storage access to exercise in-memory fallback
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error("Quota");
      },
      setItem: () => {
        throw new Error("Quota");
      },
      removeItem: () => {
        throw new Error("Quota");
      },
    },
  });
  const mem = addManyToTray("u2", [{ ...base, name: "MemoryOnly" }]);
  assert.equal(mem[0].name, "MemoryOnly");
  assert.equal(readTray("u2")[0].name, "MemoryOnly");
  clearTray();
  assert.deepEqual(readTray("u2"), []);
});

test("rankRecent handles invalid or missing lastAt timestamps without NaN", () => {
  const now = Date.UTC(2026, 9, 10);
  const ranked = rankRecent(
    [
      {
        name: "B",
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        mealType: "lunch",
        count: 2,
        lastAt: "not-a-date",
        byMeal: { lunch: 2 },
      },
      {
        name: "A",
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        mealType: "lunch",
        count: 5,
        lastAt: "",
        byMeal: { lunch: 5 },
      },
    ],
    "lunch",
    now,
  );
  assert.deepEqual(
    ranked.map((r) => r.name),
    ["A", "B"],
  );
});

test("readSnapshot validates schema and rejects corrupt payloads", () => {
  store.set("diet.offline.v1", JSON.stringify({ userId: "u1", date: "2026-10-01", entries: "bad" }));
  assert.equal(readSnapshot(), null);

  writeSnapshot({
    userId: "u1",
    email: "a@b.com",
    date: "2026-10-01",
    at: 1000,
    entries: [],
    summary: null,
    goals: {
      dailyCalories: 2000,
      dailyProtein: null,
      dailyCarbs: null,
      dailyFat: null,
      dailyFiber: null,
      dailySugar: null,
      dailySodium: null,
      weightUnit: "kg",
      timezone: "UTC",
      sex: null,
      birthYear: null,
      heightCm: null,
    },
    favorites: [],
    recent: [],
    weightLogs: [],
  });
  assert.equal(readSnapshot()?.userId, "u1");
});

test("workout-cache isolates session cache and drafts per user", () => {
  setCachedWorkout("u1", "2026-10-01", { workout: null, exerciseStats: {} });
  assert.ok(getCachedWorkout("u1", "2026-10-01"));
  assert.equal(getCachedWorkout("u2", "2026-10-01"), undefined);

  writeWorkoutDraft("u1", "2026-10-01", { title: "Push", rawNote: "Bench\n- 80kg x 5" });
  writeWorkoutDraft("u2", "2026-10-01", { title: "Pull", rawNote: "Row\n- 70kg x 8" });
  clearWorkoutDraftsUnless("u1");
  assert.equal(readWorkoutDraft("u1", "2026-10-01")?.title, "Push");
  assert.equal(readWorkoutDraft("u2", "2026-10-01"), null);

  clearWorkoutSessionCache();
  assert.equal(getCachedWorkout("u1", "2026-10-01"), undefined);
});

test("shiftDate and stripEnding handle month/leap boundaries and clamping", () => {
  assert.equal(shiftDate("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(stripEnding("2026-10-09", "2026-10-10"), "2026-10-10");
  assert.equal(stripEnding("2026-10-01", "2026-10-10"), "2026-10-04");
});

test("lookupMuscleGroup resolves aliases and prefers longest match over ambiguous substrings", () => {
  assert.equal(lookupMuscleGroup("Close-Grip Bench Press"), "Arms");
  assert.equal(lookupMuscleGroup("Overhead Press (OHP)"), "Shoulders");
  assert.equal(lookupMuscleGroup("Face Pull"), "Back");
  assert.equal(lookupMuscleGroup("Barbell Squat"), "Legs");
});
