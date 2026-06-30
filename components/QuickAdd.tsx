"use client";

import { useState } from "react";
import { api, type Favorite, type RecentFood } from "@/lib/api-client";

interface Props {
  favorites: Favorite[];
  recent: RecentFood[];
  selectedMeal: string;
  selectedDate: string;
  onLogged: () => void;
  onFavoriteDeleted: (id: string) => void;
}

export default function QuickAdd({ favorites, recent, selectedMeal, selectedDate, onLogged, onFavoriteDeleted }: Props) {
  const [logging, setLogging] = useState<string | null>(null);

  async function logFood(food: { name: string; calories: number; protein: number; carbs: number; fat: number; mealType?: string }) {
    const key = food.name;
    setLogging(key);
    try {
      await api.createEntry({
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        mealType: (food.mealType ?? selectedMeal) as "breakfast" | "lunch" | "dinner" | "snack",
        consumedAt: new Date(`${selectedDate}T12:00:00`).toISOString(),
      });
      onLogged();
    } finally {
      setLogging(null);
    }
  }

  async function deleteFav(id: string) {
    await api.deleteFavorite(id);
    onFavoriteDeleted(id);
  }

  if (favorites.length === 0 && recent.length === 0) return null;

  return (
    <div className="space-y-3">
      {favorites.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1.5">Favorites</p>
          <div className="flex flex-wrap gap-2">
            {favorites.map((f) => (
              <div key={f.id} className="flex items-center gap-1 rounded-full bg-emerald-50 pl-3 pr-1 py-1 ring-1 ring-emerald-200">
                <button
                  onClick={() => logFood(f)}
                  disabled={logging === f.name}
                  className="text-xs text-emerald-800 hover:text-emerald-600 disabled:opacity-50"
                >
                  ★ {f.name} <span className="text-emerald-500">{f.calories} kcal</span>
                </button>
                <button
                  onClick={() => deleteFav(f.id)}
                  className="ml-1 text-slate-300 hover:text-red-400 text-xs leading-none"
                  title="Remove favorite"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1.5">Recent</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={r.name}
                onClick={() => logFood(r)}
                disabled={logging === r.name}
                className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50"
              >
                {r.name} <span className="text-slate-400">{r.calories} kcal</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
