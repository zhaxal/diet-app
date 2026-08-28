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

  async function logFood(food: Favorite | RecentFood) {
    setLogging(food.name);
    try {
      await api.createEntry({
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        sugar: food.sugar,
        sodium: food.sodium,
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
          <p className="text-xs font-medium text-ink-dim mb-1.5">Favorites</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {favorites.map((f) => (
              <div key={f.id} className="flex shrink-0 items-center gap-1 rounded border border-line bg-panel-2 pl-2.5 pr-1 py-1">
                <button
                  onClick={() => logFood(f)}
                  disabled={logging === f.name}
                  className="text-xs font-medium text-accent hover:opacity-80 disabled:opacity-50 num"
                >
                  ★ {f.name} <span className="text-accent">{f.calories}</span>
                </button>
                <button onClick={() => deleteFav(f.id, f.name)} className="ml-0.5 text-ink-faint hover:text-over text-sm leading-none" title="Remove favorite">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink-dim mb-1.5">Recent</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {recent.map((r) => (
              <button
                key={r.name}
                onClick={() => logFood(r)}
                disabled={logging === r.name}
                className="shrink-0 rounded border border-line bg-panel-2 px-2.5 py-1 text-xs text-ink hover:border-ink-faint disabled:opacity-50 num"
              >
                {r.name} <span className="text-ink-faint">{r.calories}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
