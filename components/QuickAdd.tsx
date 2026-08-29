"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { api, type Favorite, type Meal, type RecentFood } from "@/lib/api-client";
import { agoLabel, consumedAtFor } from "@/lib/time-client";
import { rankRecent } from "@/lib/quick-add-rank";
import { formatQuantity, unitLabel, type QuantityUnit } from "@/lib/units";
import { useToast } from "./Toast";

interface Props {
  favorites: Favorite[];
  recent: RecentFood[];
  selectedMeal: string;
  selectedDate: string;
  onLogged: () => void;
  onFavoriteDeleted: (id: string) => void;
  onFavoritesChanged: () => void;
}

/** Everything a log needs, scaled by `factor` against what was eaten last time. */
function scaled(food: Favorite | RecentFood, factor: number) {
  const round = (n: number) => Math.round(n * factor * 10) / 10;
  return {
    calories: Math.round(food.calories * factor),
    protein: round(food.protein),
    carbs: round(food.carbs),
    fat: round(food.fat),
    fiber: round(food.fiber),
    sugar: round(food.sugar),
    sodium: Math.round(food.sodium * factor),
  };
}

export default function QuickAdd({
  favorites,
  recent,
  selectedMeal,
  selectedDate,
  onLogged,
  onFavoriteDeleted,
  onFavoritesChanged,
}: Props) {
  const toast = useToast();
  const [logging, setLogging] = useState<string | null>(null);
  // The chip whose editor is open. One at a time: this strip is the fast path,
  // and a column of open editors is the opposite of fast.
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  // Re-ranked on every meal change, with no refetch — which is the whole reason
  // the API returns per-meal counts instead of a pre-sorted list.
  const ranked = useMemo(() => rankRecent(recent, selectedMeal), [recent, selectedMeal]);

  async function logFood(food: Favorite | RecentFood, factor = 1) {
    setLogging(food.name);
    try {
      const provenance =
        "productId" in food && food.productId
          ? {
              productId: food.productId,
              // The amount scales with the macros, or the row would claim 200ml
              // while carrying the calories of 100.
              quantity: food.quantity != null ? Math.round(food.quantity * factor * 100) / 100 : null,
              quantityUnit: food.quantityUnit ?? null,
            }
          : {};

      const { entry } = await api.createEntry({
        name: food.name,
        ...scaled(food, factor),
        ...provenance,
        // The visible meal control wins. A favorite saved months ago under
        // "breakfast" must not silently override what the screen says right now.
        mealType: selectedMeal as Meal,
        consumedAt: consumedAtFor(selectedDate),
      });

      setEditing(null);
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

  async function promote(food: RecentFood) {
    try {
      await api.saveFavorite({
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        sugar: food.sugar,
        sodium: food.sodium,
        // Its own habitual meal, not the one on screen: a favorite outlives the
        // moment it was pinned in.
        mealType: food.mealType as Meal,
      });
      setEditing(null);
      // The strip excludes anything pinned, so this chip leaves Recent and
      // appears in Favorites on the refresh — the promotion is visible.
      onFavoritesChanged();
      toast(`Pinned ${food.name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not pin it", "error");
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
                    mealType: doomed.mealType ?? undefined,
                  })
                  .then(onFavoritesChanged)
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

  const open = ranked.find((r) => r.name === editing) ?? null;
  // A product-backed recent is edited in its own unit; a typed one has no unit,
  // so the only honest handle on "more" or "less" is a multiple of last time.
  const editsQuantity = open?.quantity != null && open.quantity > 0;
  const enteredAmount = Number(amount);
  const factor = !Number.isFinite(enteredAmount) || enteredAmount <= 0
    ? 1
    : editsQuantity
      ? enteredAmount / open!.quantity!
      : enteredAmount;

  return (
    <div className="space-y-3">
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
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">Recent</p>
            {/* Says why the order is what it is. Without this the strip appears
                to reshuffle itself for no reason when the meal changes. */}
            <p className="text-2xs text-ink-faint">
              most eaten at <span className="text-ink-dim">{selectedMeal}</span>
              {ranked.length > 4 ? " · scrolls" : ""}
            </p>
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {ranked.map((r) => {
              const isOpen = editing === r.name;
              return (
                <div
                  key={r.name}
                  className="flex shrink-0 items-stretch gap-1 rounded border bg-panel-2 py-1 pl-2.5 pr-1"
                  style={{ borderColor: isOpen ? "var(--accent)" : "var(--line)" }}
                >
                  <button
                    onClick={() => logFood(r)}
                    disabled={logging === r.name}
                    className="text-left disabled:opacity-50"
                  >
                    <div className="num text-xs text-ink">
                      {r.name} <span className="text-ink-faint">{r.calories}</span>
                    </div>
                    {/* The strip reports as well as offers: how established a
                        habit this is, and whether it is a current one. */}
                    <div className="num text-2xs text-ink-faint">
                      {r.count}× · {agoLabel(r.lastAt)}
                      {r.quantity != null
                        ? ` · ${formatQuantity(r.quantity, (r.quantityUnit ?? "g") as QuantityUnit)}`
                        : ""}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      const next = isOpen ? null : r.name;
                      setEditing(next);
                      setAmount(next === null ? "" : r.quantity != null ? String(r.quantity) : "1");
                    }}
                    aria-expanded={isOpen}
                    aria-label={`Options for ${r.name}`}
                    className="glyph-btn ml-1 border-l border-line text-sm leading-none text-ink-faint hover:text-ink"
                  >
                    ⋯
                  </button>
                </div>
              );
            })}
          </div>

          {open && (
            <div className="panel mt-1.5 p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="num truncate text-xs text-ink">{open.name}</span>
                <span className="num shrink-0 text-2xs text-ink-faint">
                  {open.count}× · last {agoLabel(open.lastAt)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-1.5">
                <label className="shrink-0 text-2xs uppercase tracking-wider text-ink-faint">
                  {editsQuantity ? unitLabel((open.quantityUnit ?? "g") as QuantityUnit) : "×"}
                  <span className="sr-only">
                    {editsQuantity ? "Amount" : "Multiple of last time"}
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="field num w-20 text-right"
                  aria-label={editsQuantity ? "Amount" : "Multiple of last time"}
                />
                <span className="num flex-1 text-2xs text-ink-faint">
                  = {scaled(open, factor).calories} kcal
                </span>
                <button
                  onClick={() => promote(open)}
                  className="btn btn-ghost shrink-0"
                  title="Pin to favorites"
                >
                  <Star size={13} strokeWidth={1.75} aria-hidden="true" />
                  <span className="sr-only">Pin {open.name} to favorites</span>
                </button>
                <button
                  onClick={() => logFood(open, factor)}
                  disabled={logging === open.name}
                  className="btn btn-primary shrink-0"
                >
                  {logging === open.name ? "…" : "Log"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
