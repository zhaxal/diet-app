import type { ClientWorkout, ExerciseStats } from "./api-client";

export interface CachedWorkoutSession {
  workout: ClientWorkout | null;
  exerciseStats: Record<string, ExerciseStats>;
}

const workoutSessionCache = new Map<string, CachedWorkoutSession>();
const DRAFT_PREFIX = "workout_draft_";

function cacheKey(userId: string, date: string): string {
  return `${userId}:${date}`;
}

function draftKey(userId: string, date: string): string {
  return `${DRAFT_PREFIX}${userId}_${date}`;
}

export function getCachedWorkout(
  userId: string,
  date: string,
): CachedWorkoutSession | undefined {
  if (!userId) return undefined;
  return workoutSessionCache.get(cacheKey(userId, date));
}

export function setCachedWorkout(
  userId: string,
  date: string,
  session: CachedWorkoutSession,
): void {
  if (!userId) return;
  workoutSessionCache.set(cacheKey(userId, date), session);
}

export function deleteCachedWorkout(userId: string, date: string): void {
  if (!userId) return;
  workoutSessionCache.delete(cacheKey(userId, date));
}

export function clearWorkoutSessionCache(): void {
  workoutSessionCache.clear();
}

export interface StoredWorkoutDraft {
  title: string;
  rawNote: string;
  updatedAt: number;
}

export function readWorkoutDraft(
  userId: string,
  date: string,
): StoredWorkoutDraft | null {
  if (!userId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(userId, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredWorkoutDraft>;
    if (typeof parsed?.rawNote !== "string") return null;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "Workout",
      rawNote: parsed.rawNote,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeWorkoutDraft(
  userId: string,
  date: string,
  draft: Omit<StoredWorkoutDraft, "updatedAt"> & { updatedAt?: number },
): void {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    const payload: StoredWorkoutDraft = {
      title: draft.title,
      rawNote: draft.rawNote,
      updatedAt: draft.updatedAt ?? Date.now(),
    };
    localStorage.setItem(draftKey(userId, date), JSON.stringify(payload));
  } catch {
    // Ignore quota/private-mode storage errors
  }
}

export function clearWorkoutDraft(userId: string, date: string): void {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(draftKey(userId, date));
  } catch {
    // Ignore unavailable storage
  }
}

export function clearAllWorkoutDrafts(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // Ignore unavailable storage
  }
}

export function clearWorkoutDraftsUnless(userId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const expected = `${DRAFT_PREFIX}${userId}_`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX) && !k.startsWith(expected)) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // Ignore unavailable storage
  }
}
