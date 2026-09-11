"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ScanBarcode, Star, X } from "lucide-react";
import {
  api,
  type Favorite,
  type FoodSearchResult,
  type Meal,
  type Product,
  type RecentFood,
} from "@/lib/api-client";
import type { CopiedItem } from "@/lib/copied";
import { readFoodDraft, writeFoodDraft } from "@/lib/food-draft";
import {
  EMPTY_MACRO_STRINGS,
  hasTrace,
  macroStrings,
  parseMacros,
  scaleMacros,
  type MacroStrings,
} from "@/lib/macros";
import { consumedAtFor, todayStr } from "@/lib/time-client";
import { rankRecent } from "@/lib/quick-add-rank";
import {
  baseUnitFor,
  comparableUnits,
  dimensionOf,
  formatQuantity,
  scaleFactor,
  unitLabel,
  unitsFor,
  type Basis as ProductBasis,
  type QuantityUnit,
  type ServingUnit,
} from "@/lib/units";
import BarcodeScanner, { isBarcodeScanningSupported } from "./BarcodeScanner";
import Select from "./Select";
import { useToast } from "./Toast";

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

/**
 * What the numbers in the form describe.
 *
 * Every food in this app arrives quoted against something — a label quotes per
 * 100 g, a copied row quotes the 250 g that was eaten, and a meal you are
 * typing from memory quotes itself. Naming that reference is what lets one
 * amount field mean "scale this" in the first two cases and "record this" in
 * the third, instead of silently doing the wrong one.
 */
type Reference =
  /** The numbers are the entry. An amount, if given, is recorded, not applied. */
  | { kind: "portion" }
  /** The numbers describe this much of it. An amount rescales them. */
  | { kind: "per"; amount: number; unit: QuantityUnit }
  /** The numbers are one helping of unstated size. Only a multiple can move them. */
  | { kind: "unitless" };

interface Origin {
  /** Where the numbers came from, in the label voice. */
  label: string;
  /** What they are quoted against, so the fields below are unambiguous. */
  detail: string;
}

interface Props {
  userId: string;
  date: string;
  meal: Meal;
  onMealChange: (m: Meal) => void;
  favorites: Favorite[];
  recent: RecentFood[];
  copied: CopiedItem[];
  onRemoveCopied: (key: string) => void;
  onLogged: () => void;
  onFavoritesChanged: () => void;
  seedQuery?: string;
  onSeedConsumed?: () => void;
}

const MACRO_FIELDS = [
  { key: "calories", label: "kcal" },
  { key: "protein", label: "Protein g" },
  { key: "carbs", label: "Carbs g" },
  { key: "fat", label: "Fat g" },
] as const;

const TRACE_FIELDS = [
  { key: "fiber", label: "Fiber g" },
  { key: "sugar", label: "Sugar g" },
  { key: "sodium", label: "Sodium mg" },
] as const;

/** Which day a copy came from, as a person would say it. */
function whenLabel(date: string): string {
  const today = todayStr();
  if (date === today) return "today";
  const y = new Date(`${today}T00:00:00`);
  y.setDate(y.getDate() - 1);
  if (date === `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`) {
    return "yesterday";
  }
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function AddFood({
  userId,
  date,
  meal,
  onMealChange,
  favorites,
  recent,
  copied,
  onRemoveCopied,
  onLogged,
  onFavoritesChanged,
  seedQuery = "",
  onSeedConsumed,
}: Props) {
  const toast = useToast();
  const [initialDraft] = useState(() => readFoodDraft(userId, date));
  const [draftReady, setDraftReady] = useState(false);

  // ── Finding something ────────────────────────────────────────────────────
  const [q, setQ] = useState(initialDraft?.q ?? "");
  const [products, setProducts] = useState<Product[]>([]);
  const [online, setOnline] = useState<FoodSearchResult[]>([]);
  const [searchingOnline, setSearchingOnline] = useState(false);
  const [onlineFailed, setOnlineFailed] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Read once, after mount: `BarcodeDetector` does not exist during SSR, and
  // branching on it during render would desync hydration.
  const [canScan, setCanScan] = useState(false);
  useEffect(() => setCanScan(isBarcodeScanningSupported()), []);

  // ── Composing the entry ──────────────────────────────────────────────────
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [vals, setVals] = useState<MacroStrings>(initialDraft?.vals ?? EMPTY_MACRO_STRINGS);
  const [reference, setReference] = useState<Reference>(initialDraft?.reference ?? { kind: "portion" });
  const [amount, setAmount] = useState(initialDraft?.amount ?? "");
  const [unit, setUnit] = useState<QuantityUnit>(initialDraft?.unit ?? "g");
  const [multiple, setMultiple] = useState(initialDraft?.multiple ?? "1");
  const [serving, setServing] = useState<{ size: number; unit: ServingUnit } | null>(initialDraft?.serving ?? null);
  const [productId, setProductId] = useState<string | null>(initialDraft?.productId ?? null);
  const [origin, setOrigin] = useState<Origin | null>(initialDraft?.origin ?? null);
  const [showTrace, setShowTrace] = useState(initialDraft?.showTrace ?? false);
  const [showManual, setShowManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasDraft = !!(q || name || amount || Object.values(vals).some((v) => v !== ""));
  const isComposing = Boolean(name.trim() || vals.calories.trim() || origin || showManual);

  // ── Batch selection ──────────────────────────────────────────────────────
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelection, setBatchSelection] = useState<
    Map<
      string,
      {
        name: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
        sugar: number;
        sodium: number;
        quantity: number | null;
        quantityUnit: QuantityUnit | null;
        productId: string | null;
      }
    >
  >(new Map());

  function toggleBatch(
    key: string,
    item: {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
      sugar: number;
      sodium: number;
      quantity: number | null;
      quantityUnit: QuantityUnit | null;
      productId: string | null;
    }
  ) {
    setBatchSelection((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  }

  const batchCalories = useMemo(() => {
    let sum = 0;
    for (const item of batchSelection.values()) sum += item.calories;
    return Math.round(sum);
  }, [batchSelection]);

  async function logBatch() {
    if (batchSelection.size === 0) return;
    setSaving(true);
    try {
      const items = Array.from(batchSelection.values());
      const res = await Promise.all(
        items.map((it) =>
          api.createEntry({
            name: it.name,
            calories: it.calories,
            protein: it.protein,
            carbs: it.carbs,
            fat: it.fat,
            fiber: it.fiber,
            sugar: it.sugar,
            sodium: it.sodium,
            mealType: meal,
            productId: it.productId,
            quantity: it.quantity,
            quantityUnit: it.quantityUnit,
            consumedAt: consumedAtFor(date),
          })
        )
      );
      toast(`Added ${items.length} items to ${meal}`, "success", {
        label: "Undo all",
        onAct: async () => {
          await Promise.all(res.map((r) => api.deleteEntry(r.entry.id)));
          onLogged();
        },
      });
      setBatchSelection(new Map());
      setBatchMode(false);
      onLogged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to log batch", "error");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (initialDraft) onMealChange(initialDraft.meal);
    setDraftReady(true);
    // Restore once per account/day mount, not whenever the user changes meal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    writeFoodDraft(userId, date, hasDraft
      ? { q, name, vals, reference, amount, unit, multiple, serving, productId, origin, showTrace, meal }
      : null);
  }, [draftReady, userId, date, hasDraft, q, name, vals, reference, amount, unit, multiple, serving, productId, origin, showTrace, meal]);

  const composeRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Quick add hands its query over rather than searching twice. Focus follows
  // it, so the handover lands on a field the user is already typing into.
  useEffect(() => {
    if (!seedQuery) return;
    setQ(seedQuery);
    searchRef.current?.focus();
    onSeedConsumed?.();
  }, [seedQuery, onSeedConsumed]);

  const query = q.trim();

  useEffect(() => {
    if (query.length < 1) {
      setProducts([]);
      setOnline([]);
      setOnlineFailed(false);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      api
        .listProducts(query)
        .then(({ products }) => live && setProducts(products))
        .catch(() => live && setProducts([]));

      // Open Food Facts is the one outbound call in the app and the slowest
      // thing here, so it is gated behind a second character and never blocks
      // the three local groups from rendering.
      if (query.length < 2) {
        setOnline([]);
        return;
      }
      setSearchingOnline(true);
      try {
        const { results, unavailable } = await api.searchFoods(query);
        if (live) {
          setOnline(results);
          setOnlineFailed(Boolean(unavailable));
        }
      } catch {
        if (live) {
          setOnline([]);
          setOnlineFailed(true);
        }
      } finally {
        if (live) setSearchingOnline(false);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  const lower = query.toLowerCase();
  const matchesQuery = useCallback(
    (n: string) => !lower || n.toLowerCase().includes(lower),
    [lower],
  );

  const rankedRecent = useMemo(() => rankRecent(recent, meal), [recent, meal]);
  const copiedHits = useMemo(
    () => (query ? copied.filter((c) => matchesQuery(c.name)) : []),
    [copied, query, matchesQuery],
  );
  const eatenHits = useMemo(() => {
    if (!query) return [];
    // Anything already on the tray is not offered again below it. A copy is the
    // same food carrying the day and the amount it was eaten at, so it stands
    // in for the habit rather than sitting beside an identical-looking row.
    const onTray = new Set(copiedHits.map((c) => c.name.toLowerCase()));
    const fresh = (n: string) => !onTray.has(n.toLowerCase());
    return [
      ...favorites
        .filter((f) => matchesQuery(f.name) && fresh(f.name))
        .map((f) => ({ food: f, pinned: true })),
      ...rankedRecent
        .filter((r) => matchesQuery(r.name) && fresh(r.name))
        .map((r) => ({ food: r, pinned: false })),
    ].slice(0, 6);
  }, [favorites, rankedRecent, query, matchesQuery, copiedHits]);

  // ── Loading something into the form ──────────────────────────────────────

  function focusCompose() {
    // The compose block sits below a results list that can be taller than the
    // screen, so a pick that only changed state off-screen would read as a tap
    // that did nothing.
    requestAnimationFrame(() =>
      composeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  }

  function reset() {
    writeFoodDraft(userId, date, null);
    setQ("");
    setName("");
    setVals(EMPTY_MACRO_STRINGS);
    setReference({ kind: "portion" });
    setAmount("");
    setUnit("g");
    setMultiple("1");
    setServing(null);
    setProductId(null);
    setOrigin(null);
    setShowTrace(false);
    setShowManual(false);
  }

  function pickCopied(item: CopiedItem) {
    setName(item.name);
    setVals(macroStrings(item));
    setProductId(item.productId ?? null);
    setServing(null);
    if (item.quantity != null && item.quantityUnit) {
      setReference({ kind: "per", amount: item.quantity, unit: item.quantityUnit });
      setAmount(String(item.quantity));
      setUnit(item.quantityUnit);
    } else {
      // No amount was ever recorded, so there is nothing to state a new one
      // against. A multiple of the helping is the only honest handle.
      setReference({ kind: "unitless" });
      setMultiple("1");
    }
    setOrigin({
      label: "Copied",
      detail:
        item.quantity != null && item.quantityUnit
          ? `${formatQuantity(item.quantity, item.quantityUnit)}, from ${whenLabel(item.fromDate)}`
          : `one helping, from ${whenLabel(item.fromDate)}`,
    });
    setShowTrace(hasTrace(item));
    setQ("");
    focusCompose();
  }

  function pickEaten(food: Favorite | RecentFood, pinned: boolean) {
    setName(food.name);
    setVals(macroStrings(food));
    const qty = "quantity" in food ? food.quantity : null;
    const qtyUnit = "quantityUnit" in food ? food.quantityUnit : null;
    setProductId(("productId" in food ? food.productId : null) ?? null);
    setServing(null);
    if (qty != null && qtyUnit) {
      setReference({ kind: "per", amount: qty, unit: qtyUnit });
      setAmount(String(qty));
      setUnit(qtyUnit);
    } else {
      setReference({ kind: "unitless" });
      setMultiple("1");
    }
    setOrigin({
      label: pinned ? "Favorite" : "Eaten before",
      detail:
        qty != null && qtyUnit ? formatQuantity(qty, qtyUnit) : "one helping, as last logged",
    });
    setShowTrace(hasTrace(food));
    setQ("");
    focusCompose();
  }

  function pickProduct(p: Product) {
    const base = baseUnitFor(p.basis as ProductBasis);
    setName(p.brand ? `${p.name} (${p.brand})` : p.name);
    setVals(macroStrings(p));
    setReference({ kind: "per", amount: 100, unit: base });
    setProductId(p.id);
    const decl = p.servingSize != null ? { size: p.servingSize, unit: (p.servingUnit ?? base) as ServingUnit } : null;
    setServing(decl);
    // One serving if the label defines one, else 100 of its base unit.
    setUnit(decl ? "serving" : base);
    setAmount(decl ? "1" : "100");
    setOrigin({
      label: "Saved label",
      detail: `per ${p.basis === "100ml" ? "100 ml" : "100 g"}${
        decl ? ` · serving ${formatQuantity(decl.size, decl.unit)}` : ""
      }`,
    });
    setShowTrace(hasTrace(p));
    setQ("");
    focusCompose();
  }

  function pickOnline(r: FoodSearchResult) {
    setName(r.name);
    setVals(macroStrings(r));
    setReference({ kind: "per", amount: 100, unit: "g" });
    setProductId(null);
    setServing(null);
    setUnit("g");
    setAmount("100");
    setOrigin({ label: "Open Food Facts", detail: "per 100 g — check it against the pack" });
    setShowTrace(hasTrace(r));
    setQ("");
    focusCompose();
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
        pickProduct(product as Product);
        toast(`Found ${product.name}`);
        return;
      }
      // Open Food Facts is a stranger's reading of the label, so it is saved
      // into the catalog where it can be corrected, not logged straight through.
      const { product: saved } = await api.saveProduct(product);
      pickProduct(saved);
      toast(`Saved ${saved.name} from Open Food Facts — check the numbers`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Barcode lookup failed", "error");
    }
  }

  // ── What will actually be logged ─────────────────────────────────────────

  const enteredAmount = Number(amount);
  const hasAmount = amount.trim() !== "" && Number.isFinite(enteredAmount) && enteredAmount > 0;
  const enteredMultiple = Number(multiple);

  /** Null means the amount cannot be reconciled with what the numbers describe. */
  const factor: number | null =
    reference.kind === "portion"
      ? 1
      : reference.kind === "unitless"
        ? Number.isFinite(enteredMultiple) && enteredMultiple > 0
          ? enteredMultiple
          : null
        : hasAmount
          ? scaleFactor({ amount: enteredAmount, unit }, reference, serving)
          : null;

  const source = parseMacros(vals);
  const result = scaleMacros(source, factor ?? 1);

  // Only units this amount can be restated in. A per-100g label offers grams
  // and ounces — and servings when it declares one; an impossible pairing is
  // never offered rather than rejected after the fact.
  //
  // Hand-typed values are the exception, because nothing has been read off a
  // label yet: the basis is still the author's to declare, and it follows
  // whichever unit they pick. Constraining it to the incumbent dimension made
  // "per 100 ml" reachable only by choosing millilitres *before* tapping
  // PER 100 — the same form, two outcomes, decided by tap order and signposted
  // nowhere.
  const offeredUnits: QuantityUnit[] =
    reference.kind === "per"
      ? origin
        ? reference.unit === "serving"
          ? ["serving"]
          : serving
            ? unitsFor(dimensionOf(reference.unit) === "volume" ? "100ml" : "100g", true)
            : comparableUnits(reference.unit)
        : ["g", "oz", "ml", "floz"]
      : ["g", "oz", "ml", "floz", "serving"];

  const perLabel = reference.kind === "per" && reference.amount === 100
    ? `per 100 ${unitLabel(reference.unit)}`
    : null;

  function setPerHundred(on: boolean) {
    if (!on) {
      setReference({ kind: "portion" });
      return;
    }
    // Per 100 of *what* follows the amount's own unit, so switching to
    // millilitres does not leave the label quoting grams.
    const base = dimensionOf(unit) === "volume" ? "ml" : "g";
    if (dimensionOf(unit) === "serving") setUnit(base);
    setReference({ kind: "per", amount: 100, unit: base });
  }

  function changeUnit(next: QuantityUnit) {
    // Changing the unit restates the amount; it does not reinterpret the number.
    // Switching 241 g to ounces means 8.5 oz — leaving "241" in the box would
    // silently log four kilos of porridge, with the arithmetic all correct.
    // scaleFactor is the arbiter, not a dimension check: a per-100g label with a
    // declared serving genuinely converts grams to servings, and 241 g of a
    // 170 g serving is 1.42 of them.
    const restated = hasAmount
      ? scaleFactor({ amount: enteredAmount, unit }, { amount: 1, unit: next }, serving)
      : null;
    if (restated !== null) {
      // Grams and millilitres are whole numbers — nobody weighs to a hundredth
      // of a gram, and rounding them is also what makes g→oz→g return 241
      // rather than 240.97.
      const whole = next === "g" || next === "ml";
      setAmount(String(whole ? Math.round(restated) : Math.round(restated * 100) / 100));
    }
    setUnit(next);

    // In the hand-typed per-100 mode the basis follows the unit: switching to
    // millilitres declares a liquid, so the figures become per 100 ml and the
    // amount keeps its number. Against a saved label the basis must not move —
    // the label says what it says, and only the catalog editor may change it.
    if (!origin && reference.kind === "per" && reference.amount === 100) {
      const base = dimensionOf(next) === "volume" ? "ml" : "g";
      if (dimensionOf(next) !== "serving") setReference({ kind: "per", amount: 100, unit: base });
    }
  }

  /** Why nothing can be logged yet, in the words of the control that is wrong. */
  const problem: string | null =
    factor !== null
      ? null
      : reference.kind === "unitless"
        ? "Enter how many helpings."
        : !hasAmount
          ? "Enter an amount."
          : reference.kind === "per"
            ? `Cannot convert ${unitLabel(reference.unit)} to ${unitLabel(unit)} — choose a compatible unit.`
            : "Enter an amount.";

  /** Nothing has been chosen or typed, so there is no reading to preview yet. */
  const touched = name.trim().length > 0 || vals.calories.trim() !== "";

  const canLog =
    name.trim().length > 0 && vals.calories.trim() !== "" && factor !== null && !saving;

  async function log(e: React.FormEvent) {
    e.preventDefault();
    if (factor === null) return;
    setSaving(true);
    try {
      // A recorded amount is one the entry can be read back against. In the
      // unitless case there is none, and inventing "1 serving" would be a claim
      // the original row never made.
      const recordAmount = reference.kind !== "unitless" && hasAmount;
      const { entry } = await api.createEntry({
        name: name.trim(),
        ...result,
        mealType: meal,
        productId,
        quantity: recordAmount ? enteredAmount : null,
        quantityUnit: recordAmount ? unit : null,
        consumedAt: consumedAtFor(date),
      });
      toast(`Added ${name.trim()}`, "success", {
        label: "Undo",
        onAct: () => {
          return api
            .deleteEntry(entry.id)
            .then(onLogged);
        },
      });
      reset();
      onLogged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add entry", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveFavorite() {
    try {
      await api.saveFavorite({ name: name.trim(), ...result, mealType: meal });
      onFavoritesChanged();
      toast("Saved to favorites");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save favorite", "error");
    }
  }

  async function deleteFav(id: string, name: string) {
    const doomed = favorites.find((f) => f.id === id);
    try {
      await api.deleteFavorite(id);
      onFavoritesChanged();
      toast(
        `Removed ${name}`,
        "info",
        doomed
          ? {
              label: "Undo",
              onAct: () => {
                return api
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
                  .then(() => onFavoritesChanged());
              },
            }
          : undefined,
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not remove favorite", "error");
    }
  }

  // A label is per 100 of something. It can only be derived when the form knows
  // how much its numbers describe — which is why this used to be wrong: the old
  // control saved whatever was typed as a per-100g product even when the
  // numbers were the 250 g actually eaten.
  const per100Basis: ProductBasis | null = (() => {
    const ref =
      reference.kind === "per"
        ? reference
        : reference.kind === "portion" && hasAmount
          ? { amount: enteredAmount, unit }
          : null;
    if (!ref) return null;
    const dim = dimensionOf(ref.unit);
    if (dim === "serving" && !serving) return null;
    const d = dim === "serving" && serving ? dimensionOf(serving.unit) : dim;
    return d === "volume" ? "100ml" : "100g";
  })();

  async function saveProduct() {
    if (!per100Basis) return;
    const base = baseUnitFor(per100Basis);
    const ref =
      reference.kind === "per" ? reference : { amount: enteredAmount, unit };
    const f = scaleFactor({ amount: 100, unit: base }, ref, serving);
    if (f === null) {
      toast("These numbers cannot be restated per 100 — check the unit", "error");
      return;
    }
    try {
      await api.saveProduct({
        name: name.trim(),
        ...scaleMacros(source, f),
        basis: per100Basis,
        ...(serving ? { servingSize: serving.size, servingUnit: serving.unit } : {}),
      });
      toast(`Saved to products, per 100 ${base}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save product", "error");
    }
  }

  const resultsShown =
    query.length > 0 &&
    (copiedHits.length > 0 ||
      products.length > 0 ||
      eatenHits.length > 0 ||
      online.length > 0 ||
      searchingOnline ||
      onlineFailed);

  return (
    <div className="space-y-2">
      {hasDraft && (
        <div className="flex items-center justify-between gap-2 text-xs text-ink-dim">
          <span>Draft kept on this device · {meal} · {whenLabel(date)}</span>
          <button type="button" onClick={reset} disabled={saving} className="shrink-0 text-ink-dim underline">Discard draft</button>
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search copied, saved, eaten and online…"
          aria-label="Search foods"
          className="field flex-1"
        />
        {/* Cross-browser barcode scanner: native BarcodeDetector on Chrome/Android,
            pure ZXing polyfill on Safari/iOS, plus photo capture and manual fallback */}
        {canScan && (
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="btn btn-ghost shrink-0 px-2"
            aria-label="Scan a barcode"
            title="Scan a barcode"
          >
            <ScanBarcode size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {scanning && <BarcodeScanner onDetected={onScanned} onClose={() => setScanning(false)} />}

      {query.length > 0 && !resultsShown && (
        <div className="flex items-center justify-between text-xs text-ink-faint py-1">
          <span>Nothing matches “{query}”.</span>
          <button
            type="button"
            onClick={() => {
              setName(query);
              setShowManual(true);
              focusCompose();
            }}
            className="text-accent hover:underline font-medium"
          >
            Create “{query}” →
          </button>
        </div>
      )}

      {resultsShown && (
        <div
          className="max-h-72 overflow-y-auto rounded border"
          style={{ borderColor: "var(--line)" }}
        >
          <Group label="Copied" hint="from your log">
            {copiedHits.map((c) => (
              <ResultRow
                key={c.key}
                name={c.name}
                note={
                  c.quantity != null && c.quantityUnit
                    ? formatQuantity(c.quantity, c.quantityUnit)
                    : whenLabel(c.fromDate)
                }
                figure={`${c.calories}`}
                onPick={() => pickCopied(c)}
              />
            ))}
          </Group>
          <Group label="Saved labels">
            {products.map((p) => (
              <ResultRow
                key={p.id}
                name={p.brand ? `${p.name} · ${p.brand}` : p.name}
                note={`per 100${baseUnitFor(p.basis as ProductBasis)}`}
                figure={`${p.calories}`}
                onPick={() => pickProduct(p)}
              />
            ))}
          </Group>
          <Group label="Eaten before">
            {eatenHits.map(({ food, pinned }) => (
              <ResultRow
                key={(pinned ? "f:" : "r:") + food.name}
                name={`${pinned ? "★ " : ""}${food.name}`}
                note={
                  "quantity" in food && food.quantity != null && food.quantityUnit
                    ? formatQuantity(food.quantity, food.quantityUnit)
                    : "one helping"
                }
                figure={`${food.calories}`}
                onPick={() => pickEaten(food, pinned)}
              />
            ))}
          </Group>
          <Group
            label="Open Food Facts"
            note={
              searchingOnline
                ? "searching…"
                : onlineFailed
                  ? "could not be reached"
                  : query.length >= 2 && online.length === 0
                    ? "no matches"
                    : undefined
            }
          >
            {online.map((r, i) => (
              <ResultRow
                key={`o${i}`}
                name={r.name}
                note="per 100g"
                figure={`${r.calories}`}
                onPick={() => pickOnline(r)}
              />
            ))}
          </Group>
        </div>
      )}

      {/* The tray, when nothing is being searched. Copying a row is only useful
          if the copies are visible without having to remember their names. */}
      {!query && copied.length > 0 && (
        <div>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-dim">
            Copied
          </p>
          <div className="scroll-fade-x overflow-hidden">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {copied.map((c) => (
                <div
                  key={c.key}
                  className="flex shrink-0 items-stretch gap-1 rounded border border-line bg-panel-2 py-1 pl-2.5 pr-1"
                >
                  <button type="button" onClick={() => pickCopied(c)} className="text-left">
                    <div className="num text-xs text-ink flex items-center gap-1.5">
                      <span className="truncate max-w-[10rem]">{c.name}</span>
                      <span className="shrink-0 text-ink-faint">{c.calories}</span>
                    </div>
                    <div className="num text-2xs text-ink-faint">
                      {c.quantity != null && c.quantityUnit
                        ? formatQuantity(c.quantity, c.quantityUnit)
                        : "1 helping"}{" "}
                      · {whenLabel(c.fromDate)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveCopied(c.key)}
                    className="glyph-btn ml-1 border-l border-line text-sm leading-none text-ink-faint hover:text-over"
                    aria-label={`Remove ${c.name} from copied`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Batch action queue bar when batch mode is active */}
      {!query && batchMode && (
        <div className="flex items-center justify-between gap-2 rounded border border-accent/40 bg-panel-2 p-2">
          <div className="flex items-baseline gap-1.5 text-2xs">
            <span className="font-semibold uppercase tracking-wider text-accent">Batch queue:</span>
            <span className="num font-semibold text-ink">
              {batchSelection.size} {batchSelection.size === 1 ? "item" : "items"}
            </span>
            <span className="num text-ink-faint">({batchCalories} kcal)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={batchSelection.size === 0 || saving}
              onClick={logBatch}
              className="btn btn-primary py-1 text-2xs"
            >
              {saving ? "Logging…" : `Log to ${meal}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setBatchSelection(new Map());
                setBatchMode(false);
              }}
              className="btn btn-ghost py-1 text-2xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Favorites tray, visible when not searching so your staple foods are 1 tap away */}
      {!query && favorites.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
              Favorites
            </p>
            <button
              type="button"
              onClick={() => {
                setBatchMode((b) => !b);
                if (batchMode) setBatchSelection(new Map());
              }}
              className="text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
            >
              {batchMode ? "Done" : "Batch +"}
            </button>
          </div>
          <div className="scroll-fade-x overflow-hidden">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {favorites.map((f) => {
                const isSelected = batchSelection.has(`fav:${f.id}`);
                return (
                  <div
                    key={f.id}
                    className={`flex shrink-0 items-stretch gap-1 rounded border py-1 pl-2.5 pr-1 transition-colors ${
                      isSelected ? "border-accent bg-panel text-accent" : "border-line bg-panel-2"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (batchMode) {
                          toggleBatch(`fav:${f.id}`, {
                            name: f.name,
                            calories: f.calories,
                            protein: f.protein,
                            carbs: f.carbs,
                            fat: f.fat,
                            fiber: f.fiber,
                            sugar: f.sugar,
                            sodium: f.sodium,
                            quantity: null,
                            quantityUnit: null,
                            productId: null,
                          });
                        } else {
                          pickEaten(f, true);
                        }
                      }}
                      className="text-left flex items-center gap-1.5"
                    >
                      {batchMode && (
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-xs border text-2xs ${
                            isSelected
                              ? "border-accent bg-accent text-panel"
                              : "border-ink-faint bg-panel"
                          }`}
                        >
                          {isSelected && <Check size={10} strokeWidth={3} />}
                        </span>
                      )}
                      <div>
                        <div className="flex items-center gap-1 text-xs font-medium text-accent">
                          <Star size={11} className="shrink-0 fill-accent" strokeWidth={1.75} aria-hidden="true" />
                          <span className="truncate max-w-[10rem]">{f.name}</span>
                          <span className="num shrink-0 text-accent">{f.calories}</span>
                        </div>
                        <div className="num text-2xs text-ink-faint">
                          {f.mealType ? `${f.mealType} · 1 portion` : "1 portion"}
                        </div>
                      </div>
                    </button>
                    {!batchMode && (
                      <button
                        type="button"
                        onClick={() => deleteFav(f.id, f.name)}
                        className="glyph-btn ml-1 border-l border-line text-ink-faint hover:text-over"
                        aria-label={`Remove ${f.name} from favorites`}
                      >
                        <X size={12} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Recent strip, visible when not searching to surface habit foods */}
      {!query && rankedRecent.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
              Recent
            </p>
            {favorites.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setBatchMode((b) => !b);
                  if (batchMode) setBatchSelection(new Map());
                }}
                className="text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
              >
                {batchMode ? "Done" : "Batch +"}
              </button>
            )}
          </div>
          <div className="scroll-fade-x overflow-hidden">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {rankedRecent.slice(0, 8).map((r) => {
                const isSelected = batchSelection.has(`rec:${r.name}`);
                return (
                  <div
                    key={r.name}
                    className={`flex shrink-0 items-stretch gap-1 rounded border py-1 px-2.5 transition-colors ${
                      isSelected ? "border-accent bg-panel text-accent" : "border-line bg-panel-2"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (batchMode) {
                          toggleBatch(`rec:${r.name}`, {
                            name: r.name,
                            calories: r.calories,
                            protein: r.protein,
                            carbs: r.carbs,
                            fat: r.fat,
                            fiber: r.fiber,
                            sugar: r.sugar,
                            sodium: r.sodium,
                            quantity: r.quantity ?? null,
                            quantityUnit: (r.quantityUnit as QuantityUnit) ?? null,
                            productId: r.productId ?? null,
                          });
                        } else {
                          pickEaten(r, false);
                        }
                      }}
                      className="text-left flex items-center gap-1.5"
                    >
                      {batchMode && (
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-xs border text-2xs ${
                            isSelected
                              ? "border-accent bg-accent text-panel"
                              : "border-ink-faint bg-panel"
                          }`}
                        >
                          {isSelected && <Check size={10} strokeWidth={3} />}
                        </span>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                          <span className="truncate max-w-[10rem]">{r.name}</span>
                          <span className="num shrink-0 text-ink-faint">{r.calories}</span>
                        </div>
                        <div className="num text-2xs text-ink-faint">
                          {r.mealType ? `${r.mealType} · ` : ""}
                          {r.quantity ? formatQuantity(r.quantity, r.quantityUnit || "g") : "1 portion"}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!query && favorites.length === 0 && rankedRecent.length === 0 && copied.length === 0 && (
        <p className="text-2xs text-ink-faint">
          Log your first meal to build your quick-add strip.
        </p>
      )}

      {/* ── Compose ───────────────────────────────────────────────────────── */}
      {!isComposing ? (
        <div className="flex items-center justify-between border-t border-line-soft pt-2">
          <button
            type="button"
            onClick={() => {
              setShowManual(true);
              focusCompose();
            }}
            className="text-2xs font-semibold uppercase tracking-wider text-ink-dim hover:text-accent hover:underline"
          >
            + Custom food entry
          </button>
          <span className="text-2xs text-ink-faint">Or search / pick above</span>
        </div>
      ) : (
        <div ref={composeRef}>
          <form onSubmit={log} className="grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-4">
            <div className="col-span-full flex items-center justify-between">
              <span className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                {origin ? "Confirm & Scale" : "Manual entry"}
              </span>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setShowManual(false);
                }}
                className="text-2xs text-ink-faint hover:text-over"
              >
                close
              </button>
            </div>
          <label className="col-span-full block">
            <span className="block text-2xs uppercase tracking-wider text-ink-faint">Food</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field mt-0.5 w-full"
            />
          </label>

          {/* What the seven figures below are quoted against — the one thing
              that decides whether the amount rescales them or annotates them. */}
          <div className="col-span-full flex items-center gap-2">
            {origin ? (
              <>
                <span className="min-w-0 truncate text-2xs uppercase tracking-wider text-ink-dim">
                  {origin.label}
                  <span className="ml-1.5 normal-case tracking-normal text-ink-faint">
                    {origin.detail}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={reset}
                  className="ml-auto shrink-0 text-2xs text-ink-faint hover:text-over"
                >
                  clear
                </button>
              </>
            ) : (
              <div className="flex w-full items-center justify-between text-2xs">
                <span className="text-ink-faint">
                  {reference.kind === "per"
                    ? `Quoting ${perLabel ?? "per 100"} · scales with amount below`
                    : "Direct portion total"}
                </span>
                <button
                  type="button"
                  onClick={() => setPerHundred(reference.kind !== "per")}
                  className="text-2xs font-medium text-ink-dim hover:text-accent hover:underline"
                >
                  {reference.kind === "per" ? "Switch to direct portion" : "+ Quote per 100 g/ml"}
                </button>
              </div>
            )}
          </div>

          {MACRO_FIELDS.map((f) => (
            <NumInput
              key={f.key}
              label={f.label}
              value={vals[f.key]}
              onChange={(v) => setVals({ ...vals, [f.key]: v })}
              required={f.key === "calories"}
            />
          ))}
          {showTrace &&
            TRACE_FIELDS.map((f) => (
              <NumInput
                key={f.key}
                label={f.label}
                value={vals[f.key]}
                onChange={(v) => setVals({ ...vals, [f.key]: v })}
              />
            ))}
          {showTrace && <div />}

          {reference.kind === "unitless" ? (
            <label className="col-span-2 block">
              <span className="block text-2xs uppercase tracking-wider text-ink-faint">
                Helpings
              </span>
              <input
                type="number"
                min={0}
                step="any"
                value={multiple}
                onChange={(e) => setMultiple(e.target.value)}
                className="field num mt-0.5 w-full text-right scroll-mb-28"
              />
            </label>
          ) : (
            <>
              <label className="block">
                <span className="block text-2xs uppercase tracking-wider text-ink-faint">
                  Amount
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="field num mt-0.5 w-full text-right scroll-mb-28"
                  aria-label={
                    reference.kind === "per" ? "Amount to log" : "Amount, recorded on the entry"
                  }
                />
              </label>
              <Select
                value={unit}
                onChange={(e) => changeUnit(e.target.value as QuantityUnit)}
                aria-label="Amount unit"
                wrapClassName="self-end"
              >
                {offeredUnits.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </Select>
            </>
          )}

          <Select
            value={meal}
            onChange={(e) => onMealChange(e.target.value as Meal)}
            aria-label="Meal"
            className="capitalize"
            wrapClassName="col-span-2 self-end"
          >
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>

          {/* Subordinate actions: Trace disclosure & saving to favorites/catalog */}
          <div className="col-span-full flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pt-1">
            <button
              type="button"
              onClick={() => setShowTrace((s) => !s)}
              className="text-2xs uppercase tracking-wider text-ink-faint hover:text-ink transition-colors"
            >
              {showTrace ? "− fewer" : "+ fiber / sugar / sodium"}
            </button>
            {canLog && (
              <div className="flex items-center gap-3">
                <button type="button" onClick={saveFavorite} className="text-2xs text-accent hover:underline">
                  ★ favorite
                </button>
                {per100Basis && (
                  <button type="button" onClick={saveProduct} className="text-2xs text-accent hover:underline">
                    ⬚ save label
                  </button>
                )}
              </div>
            )}
          </div>

          {/* What the row will say, before it says it. Under a label this is the
              only place the arithmetic is visible. */}
          <div
            className="col-span-full flex items-baseline gap-2 border-t pt-2.5 pb-1"
            style={{ borderColor: "var(--line-soft)", background: "var(--panel)" }}
          >
            {!touched ? (
              <div className="flex-1 flex items-baseline justify-between text-2xs text-ink-faint">
                <span>Pick something above, or type numbers in.</span>
                <span className="hidden sm:inline text-ink-faint/80">
                  Tip: AI assistant can log via MCP
                </span>
              </div>
            ) : problem ? (
              <p className="flex-1 text-2xs text-over">{problem}</p>
            ) : (
              <p className="num flex-1 text-2xs text-ink-faint">
                <span className="text-sm font-semibold text-ink">{result.calories}</span> kcal
                <span className="ml-2">
                  P{result.protein} C{result.carbs} F{result.fat}
                </span>
                {/* In "as eaten" the amount annotates rather than multiplies, and
                    the difference is invisible unless the preview names it. */}
                {reference.kind === "portion" && hasAmount && (
                  <span className="ml-2 text-ink-faint">
                    · {formatQuantity(enteredAmount, unit)} recorded
                  </span>
                )}
              </p>
            )}
            <button type="submit" disabled={!canLog} className="btn btn-primary shrink-0">
              {saving ? "Adding…" : "Log"}
            </button>
          </div>
        </form>
      </div>
      )}
    </div>
  );
}

/** A labelled band inside the results list. Renders nothing when it is empty. */
function Group({
  label,
  hint,
  note,
  children,
}: {
  label: string;
  hint?: string;
  note?: string;
  children: React.ReactNode[];
}) {
  const items = children.filter(Boolean);
  if (items.length === 0 && !note) return null;
  return (
    <div>
      <div
        className="flex items-baseline justify-between border-b px-2.5 py-1"
        style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
      >
        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">{label}</span>
        {(note ?? hint) && <span className="text-2xs text-ink-faint">{note ?? hint}</span>}
      </div>
      {items.length > 0 && (
        <ul className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
          {items}
        </ul>
      )}
    </div>
  );
}

function ResultRow({
  name,
  note,
  figure,
  onPick,
}: {
  name: string;
  note: string;
  figure: string;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-panel-2"
      >
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{name}</span>
        <span className="num shrink-0 text-2xs text-ink-faint">{note}</span>
        <span className="num w-10 shrink-0 text-right text-sm font-semibold text-ink">
          {figure}
        </span>
      </button>
    </li>
  );
}

function NumInput({
  value,
  onChange,
  label,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-2xs uppercase tracking-wider text-ink-faint">{label}</span>
      <input
        type="number"
        min={0}
        step="any"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field num mt-0.5 w-full text-right scroll-mb-28"
      />
    </label>
  );
}
