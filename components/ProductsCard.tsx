"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Meal, type Product } from "@/lib/api-client";
import Select from "./Select";
import BarcodeScanner, { isBarcodeScanningSupported } from "./BarcodeScanner";
import { ScanBarcode } from "lucide-react";
import {
  baseUnitFor,
  formatQuantity,
  unitLabel,
  unitsFor,
  type Basis,
  type QuantityUnit,
  type ServingUnit,
} from "@/lib/units";
import { useToast } from "./Toast";

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
  // A quantity is a number and a unit. It used to be a number called "grams"
  // that also held millilitres for a 100ml product.
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState<Record<string, QuantityUnit>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  // Read once, after mount: `BarcodeDetector` does not exist during SSR, and
  // branching on it during render would desync hydration.
  const [canScan, setCanScan] = useState(false);
  useEffect(() => setCanScan(isBarcodeScanningSupported()), []);

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
    const u = unitOf(p);
    const n = Number(amount[p.id] ?? defaultAmount(p));
    if (!Number.isFinite(n) || n <= 0) {
      toast(`Enter an amount in ${unitLabel(u)}`, "error");
      return;
    }
    setBusy(p.id);
    try {
      await api.logProduct(p, n, u, defaultMeal, date);
      toast(`Logged ${formatQuantity(n, u)} ${p.name}`);
      onLogged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to log", "error");
    } finally {
      setBusy(null);
    }
  }

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
            toast(e instanceof Error ? e.message : "Could not restore it", "error");
          }
        },
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to delete", "error");
    }
  }

  async function onScanned(code: string) {
    setScanning(false);
    try {
      const { source, product } = await api.lookupBarcode(code);
      if (!product) {
        toast(`Barcode ${code} is not in your catalog or Open Food Facts`, "info");
        return;
      }
      if (source === "saved") {
        // Already known — surface it rather than saving a duplicate.
        setQ(product.name);
        toast(`Found ${product.name}`);
        return;
      }
      // Open Food Facts is a stranger's reading of the label, so it is saved
      // into the catalog where it can be corrected, not logged straight through.
      await api.saveProduct(product);
      await load("");
      setQ(product.name);
      toast(`Saved ${product.name} from Open Food Facts — check the numbers`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Barcode lookup failed", "error");
    }
  }

  // One serving if the label defines one, else 100 of the product's base unit.
  const defaultUnit = (p: Product): QuantityUnit =>
    p.servingSize != null ? "serving" : baseUnitFor(p.basis as Basis);
  const unitOf = (p: Product): QuantityUnit => unit[p.id] ?? defaultUnit(p);
  const defaultAmount = (p: Product) => (unitOf(p) === "serving" ? 1 : 100);
  const base = (p: Product) => baseUnitFor(p.basis as Basis);

  return (
    <div>
      <div className="flex gap-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search saved products…"
          aria-label="Search saved products"
          className="field flex-1"
        />
        {/* Chrome and Android only — Safari has no BarcodeDetector — so the
            control is absent rather than present and broken where it cannot
            work. Photographing the label for Claude remains the path there. */}
        {canScan && !manageOnly && (
          <button
            onClick={() => setScanning(true)}
            className="btn btn-ghost shrink-0 px-2"
            aria-label="Scan a barcode"
            title="Scan a barcode"
          >
            <ScanBarcode size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {scanning && (
        <BarcodeScanner onDetected={onScanned} onClose={() => setScanning(false)} />
      )}

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
                  {p.calories}kcal/100{base(p)}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-2">
                <span className="num text-2xs text-ink-faint">
                  P{p.protein} C{p.carbs} F{p.fat}
                  {p.servingSize
                    ? ` · serving ${p.servingSize}${unitLabel((p.servingUnit ?? base(p)) as ServingUnit)}`
                    : ""}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {!manageOnly && (
                    <>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={amount[p.id] ?? String(defaultAmount(p))}
                        onChange={(e) => setAmount({ ...amount, [p.id]: e.target.value })}
                        className="field num w-16 px-1.5 py-1 text-right text-xs"
                        aria-label={`Amount of ${p.name}`}
                      />
                      {/* Only units this product can actually be measured in:
                          g/oz for a per-100g label, ml/fl oz for per-100ml, and
                          `serving` only when the label declares one. An
                          impossible pairing is never offered rather than
                          rejected after the fact. */}
                      <Select
                        value={unitOf(p)}
                        onChange={(e) =>
                          setUnit({ ...unit, [p.id]: e.target.value as QuantityUnit })
                        }
                        aria-label={`Unit for ${p.name}`}
                        wrapClassName="w-24 shrink-0"
                        className="px-1.5 py-1 text-xs"
                      >
                        {unitsFor(p.basis as Basis, p.servingSize != null).map((u) => (
                          <option key={u} value={u}>
                            {unitLabel(u)}
                          </option>
                        ))}
                      </Select>
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
                    className="glyph-btn text-2xs text-ink-faint transition-colors hover:text-over"
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
          <span className="num text-ink-dim">{date}</span> — set by the meal
          selector above.
        </p>
      )}
    </div>
  );
}
