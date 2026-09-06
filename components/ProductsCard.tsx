"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestRequest } from "@/lib/latest-request";
import { api, type Product } from "@/lib/api-client";
import { macroStrings, parseMacros, type MacroStrings } from "@/lib/macros";
import {
  baseUnitFor,
  formatQuantity,
  unitLabel,
  SERVING_UNITS,
  type Basis,
  type ServingUnit,
} from "@/lib/units";
import Select from "./Select";
import { useToast } from "./Toast";

/**
 * The label catalog.
 *
 * Logging a product happens in Add food now, alongside every other way of
 * finding a food — a saved label is a source of numbers, not a separate way to
 * eat. What is left here is the catalog itself: read the numbers back, correct
 * the ones a photograph or Open Food Facts got wrong, and delete what is gone.
 * Correcting matters because most of these rows were written by the assistant,
 * and the product's second principle asks each front door to make the other's
 * work verifiable.
 */

const PER_100_FIELDS = [
  { key: "calories", label: "kcal" },
  { key: "protein", label: "Protein g" },
  { key: "carbs", label: "Carbs g" },
  { key: "fat", label: "Fat g" },
  { key: "fiber", label: "Fiber g" },
  { key: "sugar", label: "Sugar g" },
  { key: "sodium", label: "Sodium mg" },
] as const;

export default function ProductsCard() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryRef = useRef(q);
  queryRef.current = q.trim();
  const [reads] = useState(() => createLatestRequest(() => queryRef.current));

  const load = useCallback(async (query: string) => {
    setError(null);
    await reads.run(query, () => api.listProducts(query || undefined),
      ({ products }) => { setProducts(products); setLoaded(true); },
      (e) => { setError(e instanceof Error ? e.message : "Could not load saved labels"); });
  }, [reads]);

  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 250);
    return () => { clearTimeout(t); reads.invalidate(); };
  }, [q, load, reads]);

  async function remove(p: Product) {
    try {
      await api.deleteProduct(p.id);
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
      // Re-saving restores the label without re-reading it. Values are the ones
      // already on screen, so this needs no extra request to prepare.
      toast(`Deleted ${p.name}`, "info", {
        label: "Undo",
        onAct: async () => {
          try {
            await api.saveProduct({
              name: p.name,
              brand: p.brand ?? undefined,
              barcode: p.barcode ?? undefined,
              calories: p.calories,
              protein: p.protein,
              carbs: p.carbs,
              fat: p.fat,
              fiber: p.fiber,
              sugar: p.sugar,
              sodium: p.sodium,
              basis: p.basis,
              servingSize: p.servingSize ?? undefined,
              servingUnit: p.servingUnit ?? undefined,
            });
            load(q.trim());
          } catch (e) {
            throw e;
          }
        },
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to delete", "error");
    }
  }

  const base = (p: Product) => baseUnitFor(p.basis as Basis);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search saved labels…"
        aria-label="Search saved labels"
        className="field w-full"
      />

      {error && <div className="mt-2 text-xs text-ink-dim" role="alert">
        <p>Saved labels could not be refreshed. {error}</p>
        <button onClick={() => load(q.trim())} className="btn btn-ghost mt-2">Retry</button>
      </div>}
      {products.length === 0 ? (!error && (
        <p className="mt-3 text-xs text-ink-faint">
          {!loaded ? "Loading…" : q
            ? `Nothing matches “${q}”.`
            : loaded
              ? "No labels saved yet. Scan a barcode in Add food, or photograph a nutrition label and ask Claude to save it — it only has to read the label once."
              : "Loading…"}
        </p>)
      ) : (
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--line-soft)" }}>
          {products.map((p) =>
            editing === p.id ? (
              <ProductEditor
                key={p.id}
                product={p}
                onCancel={() => setEditing(null)}
                onSaved={(updated) => {
                  setProducts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                  setEditing(null);
                  toast(`Updated ${updated.name}`);
                }}
              />
            ) : (
              <li key={p.id} className="py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <button
                    onClick={() => setEditing(p.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-accent"
                    title="Correct these values"
                  >
                    {p.name}
                    {p.brand && <span className="text-ink-faint"> · {p.brand}</span>}
                  </button>
                  <span className="num shrink-0 text-2xs text-ink-faint">
                    {p.calories}kcal/100{base(p)}
                  </span>
                  <button
                    onClick={() => remove(p)}
                    className="glyph-btn shrink-0 text-2xs text-ink-faint transition-colors hover:text-over"
                    aria-label={`Delete ${p.name}`}
                  >
                    ✕
                  </button>
                </div>
                <p className="num mt-0.5 text-2xs text-ink-faint">
                  P{p.protein} C{p.carbs} F{p.fat}
                  {p.servingSize
                    ? ` · serving ${formatQuantity(p.servingSize, (p.servingUnit ?? base(p)) as ServingUnit)}`
                    : ""}
                  {p.source !== "manual" ? ` · ${p.source}` : ""}
                </p>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function ProductEditor({
  product,
  onCancel,
  onSaved,
}: {
  product: Product;
  onCancel: () => void;
  onSaved: (p: Product) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(product.name);
  const [brand, setBrand] = useState(product.brand ?? "");
  const [basis, setBasis] = useState<Basis>(product.basis as Basis);
  const [vals, setVals] = useState<MacroStrings>(macroStrings(product));
  const [servingSize, setServingSize] = useState(
    product.servingSize != null ? String(product.servingSize) : "",
  );
  const [servingUnit, setServingUnit] = useState<ServingUnit>(
    (product.servingUnit ?? baseUnitFor(product.basis as Basis)) as ServingUnit,
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const size = Number(servingSize);
      const hasServing = servingSize.trim() !== "" && Number.isFinite(size) && size > 0;
      const { product: updated } = await api.updateProduct(product.id, {
        name: name.trim(),
        brand: brand.trim() || null,
        basis,
        ...parseMacros(vals),
        servingSize: hasServing ? size : null,
        servingUnit: hasServing ? servingUnit : null,
      });
      onSaved(updated);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="px-2 py-2" style={{ background: "var(--panel-2)" }}>
      <div className="grid grid-cols-4 gap-1.5">
        <label className="col-span-4 block">
          <span className="block text-2xs uppercase tracking-wider text-ink-faint">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field mt-0.5 w-full"
          />
        </label>
        <label className="col-span-2 block">
          <span className="block text-2xs uppercase tracking-wider text-ink-faint">Brand</span>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="field mt-0.5 w-full"
          />
        </label>
        <label className="col-span-2 block">
          <span className="block text-2xs uppercase tracking-wider text-ink-faint">
            Values per
          </span>
          <Select
            value={basis}
            onChange={(e) => setBasis(e.target.value as Basis)}
            aria-label="Values per"
            className="mt-0.5"
          >
            <option value="100g">100 g</option>
            <option value="100ml">100 ml</option>
          </Select>
        </label>

        {PER_100_FIELDS.map(({ key, label }) => (
          <label key={key} className="block">
            <span className="block text-2xs uppercase tracking-wider text-ink-faint">{label}</span>
            <input
              type="number"
              min={0}
              step="any"
              value={vals[key]}
              onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
              className="field num mt-0.5 w-full text-right"
            />
          </label>
        ))}
        <div />

        <label className="block">
          <span className="block text-2xs uppercase tracking-wider text-ink-faint">Serving</span>
          <input
            type="number"
            min={0}
            step="any"
            value={servingSize}
            onChange={(e) => setServingSize(e.target.value)}
            className="field num mt-0.5 w-full text-right"
          />
        </label>
        <Select
          value={servingUnit}
          onChange={(e) => setServingUnit(e.target.value as ServingUnit)}
          aria-label="Serving unit"
          wrapClassName="self-end"
        >
          {SERVING_UNITS.map((u) => (
            <option key={u} value={u}>
              {unitLabel(u)}
            </option>
          ))}
        </Select>
        <button onClick={save} disabled={saving} className="btn btn-primary self-end">
          {saving ? "…" : "Save"}
        </button>
        <button onClick={onCancel} className="btn btn-ghost self-end">
          Cancel
        </button>
      </div>
    </li>
  );
}
