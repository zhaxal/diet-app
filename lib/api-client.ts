import { consumedAtFor } from "./time-client";
import { toBase, unitLabel, type Basis, type QuantityUnit, type ServingUnit, type WeightUnit } from "./units";
// Thin fetch wrapper for the browser UI. Relies on the httpOnly auth cookie
// (sent automatically for same-origin requests), so no token handling here.

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  mealType: Meal;
  productId?: string | null;
  quantity?: number | null;
  quantityUnit?: QuantityUnit | null;
  /** Which front door wrote this row: the screen, the assistant, or an import. */
  source?: "ui" | "mcp" | "import";
  consumedAt: string;
  createdAt: string;
}

export interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  count: number;
}

export interface Summary {
  date: string;
  total: Totals;
  byMeal: Record<string, Totals>;
}

export interface Goals {
  dailyCalories: number | null;
  dailyProtein: number | null;
  dailyCarbs: number | null;
  dailyFat: number | null;
  dailyFiber: number | null;
  dailySugar: number | null;
  dailySodium: number | null;
  weightUnit: WeightUnit;
  timezone: string;
  sex: "male" | "female" | null;
  birthYear: number | null;
  heightCm: number | null;
}

export interface WeightLog {
  id: string;
  /** The reading in the account's display unit. Storage is canonical kg. */
  weight: number;
  weightKg: number;
  /** The unit it was originally entered in, which may differ from the display. */
  enteredUnit: WeightUnit;
  loggedAt: string;
  createdAt: string;
}

export interface FoodMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface Favorite extends FoodMacros {
  id: string;
  name: string;
  mealType?: string;
  createdAt: string;
}

export interface RecentFood extends FoodMacros {
  name: string;
  /** The meal it was last eaten at. */
  mealType: string;
  /** Times eaten in the 30-day window. */
  count: number;
  /** ISO timestamp of the most recent time. */
  lastAt: string;
  /** Occurrences per meal slot, for meal-affinity ranking on the client. */
  byMeal: Record<string, number>;
  // Provenance from the most recent occurrence, so re-logging is not anonymous.
  productId?: string | null;
  quantity?: number | null;
  quantityUnit?: QuantityUnit | null;
}

export interface FoodSearchResult extends FoodMacros {
  name: string;
}

// Reference nutrition data, stored per 100 g/ml.
export interface Product extends FoodMacros {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  basis: "100g" | "100ml";
  servingSize: number | null;
  servingUnit: ServingUnit | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export type ProductInput = Omit<
  Product,
  "id" | "source" | "createdAt" | "updatedAt"
> & { brand?: string | null; barcode?: string | null; servingSize?: number | null; servingUnit?: ServingUnit | null };

export interface TrendDay {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  count: number;
}

export type MealTotals = Record<Meal, { calories: number; count: number }>;

/** The presets the range control offers. `all` starts at the first record. */
export type TrendRange = 7 | 30 | 90 | "all";

export interface Trends {
  /** The width of the window that was served, which `all` only resolves at read time. */
  days: number;
  from: string;
  to: string;
  nutrition: TrendDay[];
  weight: { date: string; value: number }[];
  /** Range totals per meal, for the distribution of when calories land. */
  meals: MealTotals;
}

/** An error `fetch` never reached the server with. */
export interface NetworkError extends Error {
  status?: number;
  offline?: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    // `fetch` rejects with a bare "Failed to fetch", which every write path was
    // showing the user verbatim. Say what actually happened, and mark it so the
    // caller can tell "nothing was saved" from "the server said no".
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const reach = offline ? "You are offline" : "Could not reach the server";
    // A failed write has a second fact to report; a failed read does not.
    const write = Boolean(init?.method) && init!.method !== "GET";
    const err = new Error(
      write ? `${reach} — nothing was saved` : reach,
    ) as NetworkError;
    err.status = 0;
    err.offline = true;
    throw err;
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore non-JSON error bodies
    }
    // Carry the status so callers can distinguish "log in again" (401/403)
    // from "the network is flaky", which must not look like being signed out.
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: { id: string; email: string } }>("/api/auth/me"),
  login: (email: string, password: string) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  getApiKey: () => request<{ apiKey: string }>("/api/auth/apikey"),
  regenerateApiKey: () =>
    request<{ apiKey: string }>("/api/auth/apikey", { method: "POST" }),

  listEntries: (date: string) =>
    request<{ entries: FoodEntry[] }>(`/api/entries?date=${date}`),
  createEntry: (data: Partial<FoodEntry>) =>
    request<{ entry: FoodEntry }>("/api/entries", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateEntry: (id: string, data: Partial<FoodEntry>) =>
    request<{ entry: FoodEntry }>(`/api/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteEntry: (id: string) =>
    request(`/api/entries/${id}`, { method: "DELETE" }),
  summary: (date: string) => request<Summary>(`/api/summary?date=${date}`),

  getGoals: () => request<{ goals: Goals }>("/api/goals"),
  saveGoals: (data: Partial<Goals>) =>
    request<{ goals: Goals }>("/api/goals", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  listWeight: () => request<{ logs: WeightLog[]; unit: WeightUnit }>("/api/weight"),
  logWeight: (weight: number, loggedAt?: string, unit?: WeightUnit) =>
    request<{ log: WeightLog; unit: WeightUnit }>("/api/weight", {
      method: "POST",
      body: JSON.stringify({ weight, loggedAt, unit }),
    }),
  deleteWeight: (id: string) =>
    request(`/api/weight/${id}`, { method: "DELETE" }),

  listFavorites: () =>
    request<{ favorites: Favorite[]; recent: RecentFood[] }>("/api/favorites"),
  saveFavorite: (data: Omit<Favorite, "id" | "createdAt">) =>
    request<{ favorite: Favorite }>("/api/favorites", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteFavorite: (id: string) =>
    request(`/api/favorites/${id}`, { method: "DELETE" }),

  getTrends: (range: TrendRange) =>
    request<Trends>(`/api/trends?days=${range}`),

  /**
   * Per-day totals for a named window. The week strip used to read these out of
   * whatever Trends happened to have loaded, so every day older than that
   * window rendered without its bar — a strip that reported nothing for exactly
   * the days you had navigated back to look at.
   */
  dayTotals: (from: string, to: string) =>
    request<Trends>(`/api/trends?from=${from}&to=${to}`),

  /** `unavailable` means the lookup could not be reached, not that it found nothing. */
  searchFoods: (q: string) =>
    request<{ results: FoodSearchResult[]; unavailable?: boolean }>(
      `/api/foods/search?q=${encodeURIComponent(q)}`,
    ),

  listProducts: (q?: string) =>
    request<{ products: Product[] }>(
      `/api/products${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  saveProduct: (data: Partial<ProductInput>) =>
    request<{ product: Product }>("/api/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateProduct: (id: string, data: Partial<ProductInput>) =>
    request<{ product: Product }>(`/api/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteProduct: (id: string) =>
    request(`/api/products/${id}`, { method: "DELETE" }),

  // Log a saved product by weight — macros scale from the per-100 basis.
  /** The saved catalog first, then Open Food Facts. */
  lookupBarcode: (code: string) =>
    request<{
      source: "saved" | "openfoodfacts" | "none";
      product: (ProductInput & { id?: string }) | null;
    }>(`/api/products/barcode/${encodeURIComponent(code)}`),

  logProduct: (
    p: Product,
    quantity: number,
    unit: QuantityUnit,
    mealType: Meal,
    date: string,
  ) => {
    // Resolved into the product's own base unit, so 2 oz of a per-100g label
    // and 1 serving of it go through the same arithmetic.
    const base = toBase(
      quantity,
      unit,
      p.basis as Basis,
      p.servingSize != null ? { size: p.servingSize, unit: p.servingUnit as ServingUnit } : null,
    );
    if (base === null) {
      return Promise.reject(
        new Error(`Cannot log ${quantity}${unitLabel(unit)} of a product measured per ${p.basis}`),
      );
    }
    const f = base / 100;
    const r1 = (n: number) => Math.round(n * f * 10) / 10;
    return request<{ entry: FoodEntry }>("/api/entries", {
      method: "POST",
      body: JSON.stringify({
        name: p.brand ? `${p.name} (${p.brand})` : p.name,
        calories: Math.round(p.calories * f),
        protein: r1(p.protein),
        carbs: r1(p.carbs),
        fat: r1(p.fat),
        fiber: r1(p.fiber),
        sugar: r1(p.sugar),
        sodium: Math.round(p.sodium * f),
        mealType,
        productId: p.id,
        quantity,
        quantityUnit: unit,
        consumedAt: consumedAtFor(date),
      }),
    });
  },

  getWorkout: (date: string) =>
    request<{ workout: ClientWorkout | null; exerciseStats: Record<string, ExerciseStats> }>(
      `/api/workouts?date=${encodeURIComponent(date)}`,
    ),

  saveWorkout: (data: { date: string; title?: string; rawNote: string; source?: "ui" | "mcp" }) =>
    request<{ workout: ClientWorkout; exerciseStats: Record<string, ExerciseStats> }>("/api/workouts", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteWorkout: (id: string) =>
    request<{ ok: boolean }>(`/api/workouts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  searchExercises: (q?: string, muscle?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (muscle && muscle !== "All") params.set("muscle", muscle);
    const qs = params.toString();
    return request<{
      exercises: Array<{
        id: string;
        name: string;
        normalized: string;
        muscleGroup?: string;
        equipment?: string;
        isCustom?: boolean;
        summary?: ExerciseStats;
      }>;
    }>(`/api/exercises${qs ? `?${qs}` : ""}`);
  },

  getExerciseHistory: (id: string) =>
    request<{
      exercise: { id: string; name: string; normalized: string };
      lifetime: { bestWeight: number; best1RM: number; totalVolume: number; totalSessions: number };
      sessions: Array<{
        workoutId: string;
        date: string;
        workoutTitle: string;
        topWeight: number;
        top1RM: number;
        volume: number;
        sets: Array<{
          id: string;
          setNumber: number;
          weight: number;
          unit: string;
          reps: number;
          isWarmup: boolean;
          isBodyweight: boolean;
          rpe?: number;
        }>;
      }>;
    }>(`/api/exercises/${encodeURIComponent(id)}/history`),

  getWorkoutDates: () =>
    request<{
      sessions: Array<{
        id: string;
        date: string;
        title: string;
        setsCount: number;
        volume: number;
      }>;
    }>("/api/workouts/dates"),

  getWorkoutSummary: (days: number = 30) =>
    request<{
      summary: {
        periodDays: number;
        totalWorkouts: number;
        totalVolume: number;
        totalSets: number;
        totalReps: number;
        displayUnit: string;
        muscleGroups: Record<string, { sets: number; percentage: number }>;
        recentWorkouts: Array<{
          id: string;
          date: string;
          title: string;
          exercisesCount: number;
          setsCount: number;
          volume: number;
        }>;
      };
    }>(`/api/workouts/summary?days=${days}`),

  importWorkouts: (data: {
    markdown?: string;
    workouts?: Array<{ date: string; title?: string; note: string }>;
    dryRun?: boolean;
    overwrite?: boolean;
  }) =>
    request<{
      ok?: boolean;
      created?: number;
      updated?: number;
      total?: number;
      dryRun?: boolean;
      totalWorkouts?: number;
      totalExercises?: number;
      totalSets?: number;
      workouts?: Array<{
        date: string;
        title: string;
        rawNote: string;
        exercisesCount: number;
        setsCount: number;
        exerciseNames: string[];
      }>;
    }>("/api/workouts/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export interface ClientWorkoutSet {
  id: string;
  workoutExerciseId: string;
  setNumber: number;
  weight: number;
  unit: string;
  reps: number;
  isWarmup: boolean;
  isBodyweight: boolean;
  rpe?: number | null;
  notes?: string | null;
}

export interface ClientWorkoutExercise {
  id: string;
  workoutId: string;
  exerciseId: string;
  order: number;
  notes?: string | null;
  exercise: {
    id: string;
    name: string;
    normalized: string;
    muscleGroup?: string | null;
  };
  sets: ClientWorkoutSet[];
}

export interface ClientWorkout {
  id: string;
  userId: string;
  date: string;
  title: string;
  rawNote: string;
  notes?: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  exercises: ClientWorkoutExercise[];
}

export interface ExerciseStats {
  exerciseId: string;
  exerciseName: string;
  normalized: string;
  lastPerformance?: string;
  lastDate?: string;
  bestWeightKg: number;
  best1RMKg: number;
  totalSetsLogged: number;
}

