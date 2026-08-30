"use client";

import { useMemo, useState } from "react";
import { api, type Favorite, type Meal, type RecentFood } from "@/lib/api-client";
import { consumedAtFor } from "@/lib/time-client";
import { rankRecent } from "@/lib/quick-add-rank";
import { useToast } from "./Toast";

interface Props {
  favorites: Favorite[];
  recent: RecentFood[];
  selectedMeal: string;
  selectedDate: string;
  onLogged: () => void;
  onFavoriteDeleted: (id: string) => void;
  /** Hands the typed query to Add food, which searches beyond what you already eat. */
  onSearchAll: (query: string) => void;
}

/**
 * The one-tap strip: what you eat, logged at the amount you ate it last time.
 *
 * It used to carry a second metadata line on every chip, a caption explaining
 * its own sort order, and a `⋯` editor for amount and pinning — three things
 * competing for attention on the fastest path in the app. Amounts and pinning
 * moved to Add food, which is where an entry is composed; what is left here is
 * a name, a figure, and a tap.
 */
export default function QuickAdd({
  favorites,
  recent,
  selectedMeal,
  selectedDate,
  onLogged,
  onFavoriteDeleted,
  onSearchAll,
}: Props) {
  const toast = useToast();
  const [logging, setLogging] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // Re-ranked on every meal change, with no refetch — which is the whole reason
  // the API returns per-meal counts instead of a pre-sorted list.
  const ranked = useMemo(() => rankRecent(recent, selectedMeal), [recent, selectedMeal]);

  const query = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    const hit = (name: string) => name.toLowerCase().includes(query);
    return [
      ...favorites.filter((f) => hit(f.name)).map((f) => ({ food: f, pinned: true })),
      ...ranked.filter((r) => hit(r.name)).map((r) => ({ food: r, pinned: false })),
    ].slice(0, 8);
  }, [query, favorites, ranked]);

  async function logFood(food: Favorite | RecentFood) {
    setLogging(food.name);
    try {
      // The chip logs exactly what was eaten last time, unscaled — so last
      // time's amount is this entry's amount, product or not. Gating the whole
      // block on a productId dropped the grams off every hand-typed repeat and
      // left the fastest path in the app quietly degrading the record.
      const provenance = {
        productId: ("productId" in food && food.productId) || null,
        quantity: ("quantity" in food && food.quantity) || null,
        quantityUnit: ("quantityUnit" in food && food.quantityUnit) || null,
      };

      const { entry } = await api.createEntry({
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        sugar: food.sugar,
        sodium: food.sodium,
        ...provenance,
        // The visible meal control wins. A favorite saved months ago under
        // "breakfast" must not silently override what the screen says right now.
        mealType: selectedMeal as Meal,
        consumedAt: consumedAtFor(selectedDate),
      });

      // This strip is one tap with no confirmation step, so a mis-tap needs a
      // way back — the same recovery entry deletion and favorites already have.
      toast(`Logged ${food.name}`, "success", {
        label: "Undo",
        onAct: () => {
          api
            .deleteEntry(entry.id)
            .then(onLogged)
            .catch(() => toast("Could not undo", "error"));
        },
      });
      onLogged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to log", "error");
    } finally {
      setLogging(null);
    }
  }

  async function deleteFav(id: string, name: string) {
    const doomed = favorites.find((f) => f.id === id);
    try {
      await api.deleteFavorite(id);
      onFavoriteDeleted(id);
      // Recoverable: this control sits inside the chip you tap to log, so a
      // mis-tap must not be final.
      toast(
        `Removed ${name}`,
        "info",
        doomed
          ? {
              label: "Undo",
              onAct: () => {
                api
                  .saveFavorite({
                    name: doomed.name,
                    calories: doomed.calories,
                    protein: doomed.protein,
                    carbs: doomed.carbs,
                    fat: doomed.fat,
                    fiber: doomed.fiber,
                    sugar: doomed.sugar,
                    sodium: doomed.sodium,
                    mealType: doomed.mealType as Meal | undefined,
                  })
                  .then(() => onLogged())
                  .catch(() => toast("Could not restore favorite", "error"));
              },
            }
          : undefined,
      );
    } catch (e) {
      // Without this the row vanished locally while surviving on the server,
      // and reappeared on the next load.
      toast(e instanceof Error ? e.message : "Could not remove favorite", "error");
    }
  }

  if (favorites.length === 0 && ranked.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {/* Always present, because the strips below scroll: most of what is in
          them is off-screen, so "what have I got" is not a question the chips
          themselves can answer. */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter what you eat…"
        aria-label="Filter favorites and recent foods"
        className="field w-full"
      />

      {query ? (
        <div>
          {matches.length === 0 ? (
            <p className="py-1 text-xs text-ink-faint">
              Nothing you have eaten matches “{q.trim()}”.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
              {matches.map(({ food, pinned }) => (
                <li key={(pinned ? "f:" : "r:") + food.name}>
                  <button
                    onClick={() => logFood(food)}
                    disabled={logging === food.name}
                    className="flex w-full items-baseline gap-2 py-1.5 text-left disabled:opacity-50"
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-sm"
                      style={{ color: pinned ? "var(--accent)" : "var(--ink)" }}
                    >
                      {pinned ? "★ " : ""}
                      {food.name}
                    </span>
                    <span className="num shrink-0 text-sm font-semibold text-ink">
                      {food.calories}
                    </span>
                    <span className="shrink-0 text-2xs uppercase tracking-wider text-ink-faint">
                      log
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* One query, two depths. This strip only knows what you have already
              eaten; Add food also reaches saved labels and Open Food Facts. */}
          <button
            onClick={() => onSearchAll(q.trim())}
            className="mt-1.5 text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
          >
            Search all foods →
          </button>
        </div>
      ) : (
        <>
          {favorites.length > 0 && (
            <div>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                Favorites
              </p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {favorites.map((f) => (
                  <div
                    key={f.id}
                    className="flex shrink-0 items-stretch gap-1 rounded border border-line bg-panel-2 py-1.5 pl-2.5 pr-1"
                  >
                    <button
                      onClick={() => logFood(f)}
                      disabled={logging === f.name}
                      className="num text-xs font-medium text-accent hover:opacity-80 disabled:opacity-50"
                    >
                      ★ {f.name} <span className="text-accent">{f.calories}</span>
                    </button>
                    <button
                      onClick={() => deleteFav(f.id, f.name)}
                      className="glyph-btn ml-1 border-l border-line text-sm leading-none text-ink-faint hover:text-over"
                      aria-label={`Remove ${f.name} from favorites`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ranked.length > 0 && (
            <div>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                Recent
              </p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {ranked.map((r) => (
                  <button
                    key={r.name}
                    onClick={() => logFood(r)}
                    disabled={logging === r.name}
                    className="num shrink-0 rounded border border-line bg-panel-2 px-2.5 py-1.5 text-xs text-ink transition-colors hover:border-ink-faint disabled:opacity-50"
                  >
                    {r.name} <span className="text-ink-faint">{r.calories}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
