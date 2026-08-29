"use client";

import { useEffect, useRef, useState } from "react";
import { api, type FoodMacros, type FoodSearchResult } from "@/lib/api-client";
import { useToast } from "./Toast";

// Search Open Food Facts (per-100g), scale by grams, and hand the result to the parent.
export default function FoodSearch({ onPick }: { onPick: (name: string, macros: FoodMacros) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [grams, setGrams] = useState("100");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [empty, setEmpty] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      setEmpty(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { results } = await api.searchFoods(q.trim());
        setResults(results);
        setOpen(true);
        // "No matches" belongs in the results area, not in a toast: a toast
        // fired on every debounce tick while the user was still typing the word.
        setEmpty(results.length === 0);
      } catch {
        setEmpty(false);
        toast("Search unavailable", "error");
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, toast]);

  const scale = (g: number) => (g > 0 ? g / 100 : 1);

  function pick(r: FoodSearchResult) {
    const f = scale(Number(grams) || 100);
    onPick(r.name, {
      calories: Math.round(r.calories * f),
      protein: Math.round(r.protein * f * 10) / 10,
      carbs: Math.round(r.carbs * f * 10) / 10,
      fat: Math.round(r.fat * f * 10) / 10,
      fiber: Math.round(r.fiber * f * 10) / 10,
      sugar: Math.round(r.sugar * f * 10) / 10,
      sodium: Math.round(r.sodium * f),
    });
    setOpen(false);
    setResults([]);
    setEmpty(false);
    setQ("");
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search food database…"
          aria-label="Search food database"
          className="field flex-1"
        />
        {/* `outline-none` on the inner input left this control with no visible
            focus at all; the border it sits in carries it instead. */}
        <div className="flex items-center gap-1 rounded border border-line px-2 focus-within:border-accent">
          <input
            type="number"
            min={1}
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            aria-label="Grams"
            className="w-14 bg-transparent text-right text-sm num outline-none"
          />
          <span className="text-xs text-ink-faint">g</span>
        </div>
      </div>

      {open && (results.length > 0 || loading || empty) && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border border-line bg-panel shadow-lg">
          {loading && <p className="px-3 py-2 text-xs text-ink-faint">Searching…</p>}
          {!loading && empty && (
            <p className="px-3 py-2 text-xs text-ink-faint">
              No matches for &ldquo;{q.trim()}&rdquo; — enter the values by hand below.
            </p>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(r)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-panel-2"
            >
              <span className="min-w-0 truncate text-ink">{r.name}</span>
              <span className="shrink-0 num text-xs text-ink-faint">{r.calories} kcal/100g</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
