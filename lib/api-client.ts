// Thin fetch wrapper for the browser UI. Relies on the httpOnly auth cookie
// (sent automatically for same-origin requests), so no token handling here.

export interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  consumedAt: string;
  createdAt: string;
}

export interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  count: number;
}

export interface Summary {
  date: string;
  total: Totals;
  byMeal: Record<string, Totals>;
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
};
