// The last reading of a day, kept on the device so the installed PWA has
// something true to show without a network.
//
// The service worker deliberately does not cache /api/ responses (see
// public/sw.js). Doing so would present stale data through the same code path
// as fresh data, which this app cannot afford: a second writer — the assistant —
// can change the day while the screen is asleep, so every reading has to carry
// the time it was taken. Here that time is explicit, and the UI renders it.
//
// Scoped to a user id and cleared on logout, because a phone gets handed around.

import type {
  Favorite,
  FoodEntry,
  Goals,
  MealTemplate,
  RecentFood,
  Summary,
  WeightLog,
} from "./api-client";

const KEY = "diet.offline.v1";

export interface DaySnapshot {
  userId: string;
  email: string;
  date: string;
  /** Epoch ms at which this reading was taken from the server. */
  at: number;
  entries: FoodEntry[];
  summary: Summary | null;
  goals: Goals;
  favorites: Favorite[];
  recent: RecentFood[];
  // Small, and the tabs that read them would otherwise render "you have none"
  // when the truth is "this device has not been told".
  weightLogs: WeightLog[];
  templates: MealTemplate[];
}

export function readSnapshot(): DaySnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as DaySnapshot;
    // A snapshot with no user id predates this format, or was hand-edited.
    if (!snap?.userId || !snap?.date || typeof snap.at !== "number") return null;
    return snap;
  } catch {
    return null;
  }
}

export function writeSnapshot(snap: DaySnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    // Private mode, or the quota is full. An offline reading is a convenience;
    // failing to store one must never break the request that produced it.
  }
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear if storage is unavailable */
  }
}

/** Drop a snapshot that belongs to somebody else on this device. */
export function clearSnapshotUnless(userId: string): void {
  const snap = readSnapshot();
  if (snap && snap.userId !== userId) clearSnapshot();
}
