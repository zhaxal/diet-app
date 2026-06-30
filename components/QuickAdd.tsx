"use client";

import { useState } from "react";
import { api, type Favorite, type RecentFood } from "@/lib/api-client";
import { useToast } from "./Toast";

interface Props {
  favorites: Favorite[];
  recent: RecentFood[];
  selectedMeal: string;
  selectedDate: string;
  onLogged: () => void;
  onFavoriteDeleted: (id: string) => void;
}

export default function QuickAdd({ favorites, recent, selectedMeal, selectedDate, onLogged, onFavoriteDeleted }: Props) {
  const toast = useToast();
  const [logging, setLogging] = useState<string | null>(null);

  async function logFood(food: { name: string; calories: number; protein: number; carbs: number; fat: number; mealType?: string }) {
    setLogging(food.name);
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
      toast(`Logged ${food.name}`);
      onLogged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to log", "error");
    } finally {
      setLogging(null);
    }
  }

  async function deleteFav(id: string, name: string) {
    await api.deleteFavorite(id);
    onFavoriteDeleted(id);
    toast(`Removed ${name} from favorites`, "info");
  }

  if (favorites.length === 0 && recent.length === 0) return null;

  return (
    <div className="space-y-3">
      {favorites.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Favorites</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {favorites.map((f) => (
              <div key={f.id} className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 pl-3 pr-1.5 py-1.5 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/20">
                <button
                  onClick={() => logFood(f)}
                  disabled={logging === f.name}
                  className="text-xs font-medium text-emerald-800 hover:text-emerald-600 disabled:opacity-50 dark:text-emerald-300 tnum"
                >
                  ★ {f.name} <span className="text-emerald-500 dark:text-emerald-400">{f.calories}</span>
                </button>
                <button onClick={() => deleteFav(f.id, f.name)} className="ml-0.5 text-slate-300 hover:text-rose-400 text-sm leading-none dark:text-slate-500" title="Remove favorite">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Recent</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {recent.map((r) => (
              <button
                key={r.name}
                onClick={() => logFood(r)}
                disabled={logging === r.name}
                className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200 disabled:opacity-50 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/10 tnum"
              >
                {r.name} <span className="text-slate-400">{r.calories}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
