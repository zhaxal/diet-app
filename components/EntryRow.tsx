"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { api, type FoodEntry } from "@/lib/api-client";
import { clockTime } from "@/lib/time-client";
import { comparableUnits, formatQuantity, unitLabel, type QuantityUnit } from "@/lib/units";
import { macroStrings } from "@/lib/macros";
import { resizePortion, restateAmount } from "@/lib/entry-portion";
import Select from "./Select";
import { useToast } from "./Toast";

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
  const [mode, setMode] = useState<"portion" | "values">("values");
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
  const portion = resizePortion(entry, Number(form.quantity), form.quantityUnit);
  const shownValues = mode === "portion" && portion ? macroStrings(portion) : form;

  function beginEdit() {
    setForm(initialForm());
    setMode(hasOriginalAmount ? "portion" : "values");
    setEditing(true);
  }

  function changeMode(next: "portion" | "values") {
    if (next === "values" && portion) setForm((current) => ({ ...current, ...macroStrings(portion) }));
    setMode(next);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "portion" && !portion) return;
    setSaving(true);
    try {
      const amount = Number(form.quantity);
      const hasAmount = form.quantity.trim() !== "" && Number.isFinite(amount) && amount > 0;
      const { entry: updated } = await api.updateEntry(entry.id, {
        name: form.name,
        calories: Number(shownValues.calories),
        protein: Number(shownValues.protein),
        carbs: Number(shownValues.carbs),
        fat: Number(shownValues.fat),
        fiber: Number(shownValues.fiber),
        sugar: Number(shownValues.sugar),
        sodium: Number(shownValues.sodium),
        mealType: form.mealType as FoodEntry["mealType"],
        // The amount is corrected here too, and clearing the field removes the
        // claim rather than leaving a stale one attached to new figures.
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

  if (editing) {
    // A row logged in millilitres is corrected in millilitres. Offering grams
    // for it would invite a unit change that silently reinterprets the figure.
    const units = comparableUnits((entry.quantityUnit ?? "g") as QuantityUnit);
    return (
      <li className="px-3 py-2" style={{ background: "var(--panel-2)" }}>
        <form onSubmit={save} className="grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-4">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="field col-span-full"
            aria-label="Food name"
          />
          {hasOriginalAmount && (
            <div className="col-span-full flex rounded border border-line" role="group" aria-label="How to edit this entry">
              {([ ["portion", "Change portion"], ["values", "Correct values"] ] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={mode === value}
                  onClick={() => changeMode(value)}
                  className={`btn flex-1 ${mode === value ? "btn-primary" : "text-ink-dim"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <p className="col-span-full text-xs text-ink-dim">
            {mode === "portion"
              ? `Nutrition scales from the saved ${formatQuantity(entry.quantity!, entry.quantityUnit ?? "g")} portion. Preview the totals below before saving.`
              : "Enter the totals for the whole entry. Changing the amount here leaves these values unchanged."}
          </p>
          {/* Labels persist above the field. A placeholder disappears the moment
              the field is populated, and these are always populated — leaving
              seven identical boxes of digits at the exact moment the user is
              being asked to verify them. */}
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
                readOnly={mode === "portion"}
                value={shownValues[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="field num mt-0.5 w-full text-right"
              />
            </label>
          ))}
          <label className="block">
            <span className="block text-2xs uppercase tracking-wider text-ink-faint">
              Amount
            </span>
            <input
              type="number"
              min={mode === "portion" ? 0.000001 : 0}
              required={mode === "portion"}
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
                setForm({ ...form,
                  quantity: restateAmount(form.quantity, form.quantityUnit, e.target.value as QuantityUnit),
                  quantityUnit: e.target.value as QuantityUnit })
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
            <div className="self-end pb-1.5 text-2xs uppercase tracking-wider text-ink-faint">
              {unitLabel(form.quantityUnit)}
            </div>
          )}
          <Select
            value={form.mealType}
            onChange={(e) => setForm({ ...form, mealType: e.target.value as FoodEntry["mealType"] })}
            aria-label="Meal"
            className="capitalize"
            wrapClassName="col-span-2 self-end"
          >
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          {mode === "portion" && !portion && (
            <p className="col-span-full text-xs text-over" role="status">Enter a positive amount to preview and save.</p>
          )}
          <button type="submit" disabled={saving || (mode === "portion" && !portion)} className="btn btn-primary col-span-1 min-[400px]:col-span-2">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost col-span-1 min-[400px]:col-span-2">
            Cancel
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="entry-row group flex items-center gap-2 px-3 py-2">
      <button
        onClick={beginEdit}
        className="entry-identity min-w-0 flex-1 text-left text-sm text-ink hover:text-accent"
        title="Edit"
      >
        <span className="block break-words">{entry.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-ink-faint">
          {entry.quantity != null && <span className="num text-ink-dim">
            {formatQuantity(entry.quantity, entry.quantityUnit ?? "g")}
          </span>}
          <span className="num">{clockTime(entry.consumedAt)}</span>
          {entry.source === "mcp" && <span title="Logged by the assistant">ai</span>}
        </span>
      </button>

      <span className="num shrink-0 text-right text-sm font-semibold text-ink">
        {entry.calories}
      </span>
      {/* Copy lifts the row onto the tray in Add food rather than logging it
          again here. Eating the same thing rarely means eating the same amount,
          and a duplicate that lands before you can say otherwise is a figure
          you then have to correct. */}
      <button
        onClick={() => onCopy(entry)}
        className="glyph-btn shrink-0 text-ink-faint transition-colors hover:text-ink"
        aria-label={`Copy ${entry.name} to add food`}
        title="Copy to Add food"
      >
        <Copy size={13} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {/* Always visible — this was opacity-0 until group-hover, i.e. permanently
          invisible on a touch device while remaining tappable. */}
      <button
        onClick={() => onDelete(entry.id)}
        className="glyph-btn shrink-0 text-2xs text-ink-faint transition-colors hover:text-over"
        aria-label={`Delete ${entry.name}`}
      >
        ✕
      </button>
    </li>
  );
}
