"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Meal, type Product } from "@/lib/api-client";
import { useToast } from "./Toast";

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

// The saved-label catalog. Products are stored per 100 g/ml, so logging one is
// "pick it, say how many grams" — no re-photographing a label already read.
export default function ProductsCard({
  date,
  defaultMeal,
  onLogged,
  manageOnly = false,
}: {
  date: string;
  defaultMeal: Meal;
  onLogged?: () => void;
  manageOnly?: boolean;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [grams, setGrams] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    try {
      const { products } = await api.listProducts(query || undefined);
      setProducts(products);
    } catch {
      /* leave the previous list in place */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  async function log(p: Product) {
    const g = Number(grams[p.id] ?? p.servingGrams ?? 100);
    if (!Number.isFinite(g) || g <= 0) {
      toast("Enter a weight in grams", "error");
      return;
    }
    setBusy(p.id);
    try {
      await api.logProduct(p, g, defaultMeal, date);
      toast(`Logged ${g}g ${p.name}`);
      onLogged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to log", "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: Product) {
    await api.deleteProduct(p.id);
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
    toast("Product deleted", "info");
  }

  const unit = (p: Product) => (p.basis === "100ml" ? "ml" : "g");

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search saved products…"
        className="field w-full"
      />

      {products.length === 0 ? (
        <p className="mt-3 text-xs text-ink-faint">
          {q
            ? `Nothing matches “${q}”.`
            : "No products saved yet. Photograph a nutrition label and ask Claude to save it — it only has to read the label once."}
        </p>
      ) : (
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--line-soft)" }}>
          {products.map((p) => (
            <li key={p.id} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-ink">
                  {p.name}
                  {p.brand && (
                    <span className="text-ink-faint"> · {p.brand}</span>
                  )}
                </span>
                <span className="num shrink-0 text-2xs text-ink-faint">
                  {p.calories}kcal/100{unit(p)}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-2">
                <span className="num text-2xs text-ink-faint">
                  P{p.protein} C{p.carbs} F{p.fat}
                  {p.servingGrams ? ` · serving ${p.servingGrams}${unit(p)}` : ""}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  {!manageOnly && (
                    <>
                      <input
                        type="number"
                        min={1}
                        value={grams[p.id] ?? String(p.servingGrams ?? 100)}
                        onChange={(e) =>
                          setGrams({ ...grams, [p.id]: e.target.value })
                        }
                        className="field num w-16 px-1.5 py-1 text-right text-xs"
                        aria-label={`Grams of ${p.name}`}
                      />
                      <span className="text-2xs text-ink-faint">{unit(p)}</span>
                      <button
                        onClick={() => log(p)}
                        disabled={busy === p.id}
                        className="btn btn-primary px-2 py-1"
                      >
                        {busy === p.id ? "…" : "Log"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => remove(p)}
                    className="px-1 text-2xs text-ink-faint hover:text-over"
                    aria-label={`Delete ${p.name}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!manageOnly && products.length > 0 && (
        <p className="mt-2 text-2xs text-ink-faint">
          Logging to <span className="text-ink-dim">{defaultMeal}</span> on{" "}
          <span className="num text-ink-dim">{date}</span>. Meal follows the Add
          panel selector.
        </p>
      )}
      {MEALS.length === 0 && null}
    </div>
  );
}
