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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { results } = await api.searchFoods(q.trim());
        setResults(results);
        setOpen(true);
        if (results.length === 0) toast("No matches found", "info");
      } catch {
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
    setQ("");
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="🔍 Search food database…"
          className="flex-1 rounded border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex items-center gap-1 rounded border border-line px-2">
          <input
            type="number"
            min={1}
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="w-12 bg-transparent text-right text-sm num outline-none"
          />
          <span className="text-xs text-ink-faint">g</span>
        </div>
      </div>

      {open && (results.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border border-line bg-white shadow-lg dark:bg-[#1a2437]">
          {loading && <p className="px-3 py-2 text-xs text-ink-faint">Searching…</p>}
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
