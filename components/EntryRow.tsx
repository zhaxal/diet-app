"use client";

import { useState } from "react";
import { Copy, Pencil } from "lucide-react";
import { api, type FoodEntry } from "@/lib/api-client";
import { clockTime } from "@/lib/time-client";
import { comparableUnits, formatQuantity, unitLabel, type QuantityUnit } from "@/lib/units";
import { macroStrings } from "@/lib/macros";
import { resizePortion, restateAmount } from "@/lib/entry-portion";
import Select from "./Select";
import { useToast } from "./Toast";
import { Dialog } from "./Dialog";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

const NUMERIC_FIELDS = [
  { key: "calories", label: "kcal", max: 100000 },
  { key: "protein", label: "Protein g", max: 10000 },
  { key: "carbs", label: "Carbs g", max: 10000 },
  { key: "fat", label: "Fat g", max: 10000 },
  { key: "fiber", label: "Fiber g", max: 10000 },
  { key: "sugar", label: "Sugar g", max: 10000 },
  { key: "sodium", label: "Sodium mg", max: 100000 },
] as const;

interface Props {
  entry: FoodEntry;
  onUpdate: (e: FoodEntry) => void;
  onDelete: (id: string) => void;
  onCopy: (e: FoodEntry) => void;
}

export default function EntryRow({ entry, onUpdate, onDelete, onCopy }: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialForm = () => ({
    name: entry.name,
    calories: entry.calories.toString(),
    protein: entry.protein.toString(),
    carbs: entry.carbs.toString(),
    fat: entry.fat.toString(),
    fiber: entry.fiber.toString(),
    sugar: entry.sugar.toString(),
    sodium: entry.sodium.toString(),
    mealType: entry.mealType,
    quantity: entry.quantity != null ? String(entry.quantity) : "",
    quantityUnit: (entry.quantityUnit ?? "g") as QuantityUnit,
  });
  const [form, setForm] = useState(initialForm);
  const hasOriginalAmount = entry.quantity != null && entry.quantity > 0;
  const [showNutrients, setShowNutrients] = useState(false);
  const [customNutrients, setCustomNutrients] = useState(false);

  const portion = resizePortion(entry, Number(form.quantity), form.quantityUnit);
  const shownValues = customNutrients || !portion ? form : macroStrings(portion);

  function beginEdit() {
    setForm(initialForm());
    setShowNutrients(!hasOriginalAmount);
    setCustomNutrients(!hasOriginalAmount);
    setEditing(true);
  }

  function handleNutrientChange(key: string, value: string) {
    setCustomNutrients(true);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleNutrients() {
    if (!showNutrients) {
      if (portion && !customNutrients) {
        setForm((current) => ({ ...current, ...macroStrings(portion) }));
      }
      setShowNutrients(true);
    } else {
      setShowNutrients(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!customNutrients && hasOriginalAmount && !portion) return;
    setSaving(true);
    try {
      const amount = Number(form.quantity);
      const hasAmount = form.quantity.trim() !== "" && Number.isFinite(amount) && amount > 0;
      const { entry: updated } = await api.updateEntry(entry.id, {
        name: form.name.trim(),
        calories: Number(shownValues.calories),
        protein: Number(shownValues.protein),
        carbs: Number(shownValues.carbs),
        fat: Number(shownValues.fat),
        fiber: Number(shownValues.fiber),
        sugar: Number(shownValues.sugar),
        sodium: Number(shownValues.sodium),
        mealType: form.mealType as FoodEntry["mealType"],
        quantity: hasAmount ? amount : null,
        quantityUnit: hasAmount ? form.quantityUnit : null,
      });
      onUpdate(updated);
      setEditing(false);
      toast("Entry updated");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  }

  // Always rendered (not gated on `editing`) so closing it animates out —
  // conditionally mounting would remove Dialog from the tree the instant
  // `editing` flips false, before it gets a frame to play its exit.
  const editDialog = (() => {
    const units = comparableUnits((entry.quantityUnit ?? "g") as QuantityUnit);
    const amountNum = Number(form.quantity);
    const amountInvalid =
      hasOriginalAmount && !customNutrients && (!Number.isFinite(amountNum) || amountNum <= 0);

    return (
      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${entry.name}`}
        description={`${entry.mealType} · ${clockTime(entry.consumedAt)}`}
        size="md"
        bodyClassName="p-3"
      >
        <form onSubmit={save} className="space-y-2">
          {/* Food name */}
          <div>
            <label className="block text-2xs uppercase tracking-wider text-ink-faint">Food</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="field mt-0.5 w-full font-medium"
              aria-label="Food name"
            />
          </div>

          {/* Amount, Unit, Meal row */}
          <div className="grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-4 items-end">
            <label className="block min-[400px]:col-span-2">
              <span className="block text-2xs uppercase tracking-wider text-ink-faint">
                Amount
              </span>
              <input
                type="number"
                min={hasOriginalAmount && !customNutrients ? 0.000001 : 0}
                required={hasOriginalAmount && !customNutrients}
                step="any"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="field num mt-0.5 w-full text-right"
              />
            </label>

            {units.length > 1 ? (
              <Select
                value={form.quantityUnit}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quantity: restateAmount(form.quantity, form.quantityUnit, e.target.value as QuantityUnit),
                    quantityUnit: e.target.value as QuantityUnit,
                  })
                }
                aria-label="Amount unit"
                wrapClassName="self-end"
              >
                {units.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="self-end pb-2 text-2xs uppercase tracking-wider text-ink-faint">
                {unitLabel(form.quantityUnit)}
              </div>
            )}

            <Select
              value={form.mealType}
              onChange={(e) => setForm({ ...form, mealType: e.target.value as FoodEntry["mealType"] })}
              aria-label="Meal"
              className="capitalize"
              wrapClassName="self-end"
            >
              {MEALS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>

          {/* Live macro preview readout */}
          <div
            className="flex items-baseline justify-between rounded border px-2.5 py-1.5 text-2xs"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <div className="num flex items-baseline gap-2">
              <span className="text-sm font-semibold text-ink">
                {shownValues.calories || 0}
              </span>
              <span className="text-ink-faint">kcal</span>
              <span className="text-ink-dim ml-1">
                P{shownValues.protein || 0} C{shownValues.carbs || 0} F{shownValues.fat || 0}
              </span>
            </div>
            {hasOriginalAmount && !customNutrients && (
              <span className="text-ink-faint">
                scales with portion
              </span>
            )}
            {customNutrients && (
              <span className="text-accent uppercase tracking-wider font-semibold">
                custom values
              </span>
            )}
          </div>

          {/* Progressive disclosure: Raw nutrients */}
          <div className="flex items-center justify-between pt-0.5">
            <button
              type="button"
              onClick={toggleNutrients}
              className="text-2xs text-ink-faint hover:text-ink font-medium"
            >
              {showNutrients ? "− Hide detailed nutrients" : "+ Edit raw nutrients"}
            </button>
            {hasOriginalAmount && customNutrients && (
              <button
                type="button"
                onClick={() => {
                  setCustomNutrients(false);
                  if (portion) setForm((curr) => ({ ...curr, ...macroStrings(portion) }));
                }}
                className="text-2xs text-accent hover:underline"
              >
                Reset to portion scale
              </button>
            )}
          </div>

          {showNutrients && (
            <div className="grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-4 pt-1 border-t border-line">
              {NUMERIC_FIELDS.map(({ key, label, max }) => (
                <label key={key} className="block">
                  <span className="block text-2xs uppercase tracking-wider text-ink-faint">
                    {label}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    step="any"
                    required
                    value={shownValues[key]}
                    onChange={(e) => handleNutrientChange(key, e.target.value)}
                    className="field num mt-0.5 w-full text-right"
                  />
                </label>
              ))}
            </div>
          )}

          {amountInvalid && (
            <p className="text-xs text-over" role="status">
              Enter a positive amount to preview and save.
            </p>
          )}

          {/* Action buttons */}
          <div
            className="sticky bottom-0 -mx-3 -mb-3 flex gap-2 border-t px-3 pb-3 pt-2"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}
          >
            <button
              type="submit"
              disabled={saving || Boolean(amountInvalid)}
              className="btn btn-primary flex-1 py-2 text-center"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn btn-ghost flex-1 py-2 text-center"
            >
              Cancel
            </button>
          </div>
        </form>
      </Dialog>
    );
  })();

  return (
    <>
      <li className="entry-row motion-list-item group flex items-center gap-2 px-3 py-2">
      <button
        onClick={beginEdit}
        className="entry-identity min-w-0 flex-1 text-left text-sm text-ink hover:text-accent flex items-center justify-between gap-2"
        title="Edit entry"
      >
        <div className="min-w-0">
          <span className="block break-words">{entry.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-ink-faint">
            {entry.quantity != null && <span className="num text-ink-dim">
              {formatQuantity(entry.quantity, entry.quantityUnit ?? "g")}
            </span>}
            <span className="num">{clockTime(entry.consumedAt)}</span>
            {entry.source === "mcp" && (
              <span className="font-medium tracking-wide text-ink-dim" aria-label="Logged by assistant">
                SRC: AI
              </span>
            )}
          </span>
        </div>
        <Pencil
          size={12}
          strokeWidth={1.75}
          className="shrink-0 text-ink-faint opacity-40 group-hover:opacity-100 group-hover:text-accent transition-opacity pointer-events-none"
          aria-hidden="true"
        />
      </button>

      <span className="num shrink-0 text-right text-sm font-semibold text-ink">
        {entry.calories}
      </span>
      {/* Copy lifts the row onto the tray in Add food rather than logging it
          again here. Eating the same thing rarely means eating the same amount,
          and a duplicate that lands before you can say otherwise is a figure
          you then have to correct. */}
      <div className="flex items-center shrink-0">
        <button
          onClick={() => onCopy(entry)}
          className="glyph-btn shrink-0 text-ink-faint transition-colors hover:text-ink"
          aria-label={`Copy ${entry.name} to add food`}
          title="Copy to Add food"
        >
          <Copy size={13} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {/* Hairline separation between safe copy and destructive delete to prevent tap collisions */}
        <span className="w-px h-3.5 bg-line shrink-0 mx-0.5" aria-hidden="true" />
        {/* Always visible — this was opacity-0 until group-hover, i.e. permanently
            invisible on a touch device while remaining tappable. */}
        <button
          onClick={() => onDelete(entry.id)}
          className="glyph-btn shrink-0 text-2xs text-ink-faint transition-colors hover:text-over"
          aria-label={`Delete ${entry.name}`}
        >
          ✕
        </button>
      </div>
      </li>
      {editDialog}
    </>
  );
}
