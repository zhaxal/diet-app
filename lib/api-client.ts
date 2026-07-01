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
  weightUnit: string;
  timezone: string;
  sex: "male" | "female" | null;
  birthYear: number | null;
  heightCm: number | null;
}

export interface WeightLog {
  id: string;
  weight: number;
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
  mealType: string;
}

export interface FoodSearchResult extends FoodMacros {
  name: string;
}

export interface TemplateItem extends FoodMacros {
  name: string;
  mealType: Meal;
}

export interface MealTemplate {
  id: string;
  name: string;
  createdAt: string;
  items: TemplateItem[];
}

export interface TrendDay {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  count: number;
}

export interface Trends {
  days: number;
  nutrition: TrendDay[];
  weight: { date: string; value: number }[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
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

  listWeight: () => request<{ logs: WeightLog[] }>("/api/weight"),
  logWeight: (weight: number, loggedAt?: string) =>
    request<{ log: WeightLog }>("/api/weight", {
      method: "POST",
      body: JSON.stringify({ weight, loggedAt }),
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

  getTrends: (days: 7 | 30) =>
    request<Trends>(`/api/trends?days=${days}`),

  copyDay: (from: string, to: string) =>
    request<{ copied: number }>("/api/entries/copy", {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),

  listTemplates: () =>
    request<{ templates: MealTemplate[] }>("/api/templates"),
  saveTemplate: (name: string, items: TemplateItem[]) =>
    request<{ template: MealTemplate }>("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name, items }),
    }),
  applyTemplate: (id: string, date: string) =>
    request<{ added: number }>(`/api/templates/${id}/apply`, {
      method: "POST",
      body: JSON.stringify({ date }),
    }),
  deleteTemplate: (id: string) =>
    request(`/api/templates/${id}`, { method: "DELETE" }),

  searchFoods: (q: string) =>
    request<{ results: FoodSearchResult[] }>(`/api/foods/search?q=${encodeURIComponent(q)}`),
};
