"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { api, type FoodEntry } from "@/lib/api-client";
import { clockTime } from "@/lib/time-client";
import { comparableUnits, formatQuantity, unitLabel, type QuantityUnit } from "@/lib/units";
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
  const [form, setForm] = useState({
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

  async function save() {
    setSaving(true);
    try {
      const amount = Number(form.quantity);
      const hasAmount = form.quantity.trim() !== "" && Number.isFinite(amount) && amount > 0;
      const { entry: updated } = await api.updateEntry(entry.id, {
        name: form.name,
        calories: Number(form.calories),
        protein: Number(form.protein),
        carbs: Number(form.carbs),
        fat: Number(form.fat),
        fiber: Number(form.fiber),
        sugar: Number(form.sugar),
        sodium: Number(form.sodium),
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
        <div className="grid grid-cols-4 gap-1.5">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="field col-span-4"
            aria-label="Food name"
          />
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
                value={form[key]}
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
              min={0}
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
                setForm({ ...form, quantityUnit: e.target.value as QuantityUnit })
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
          <button onClick={save} disabled={saving} className="btn btn-primary col-span-2">
            {saving ? "…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="btn btn-ghost col-span-2">
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-baseline gap-2 px-3 py-2">
      <button
        onClick={() => setEditing(true)}
        className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-accent"
        title="Edit"
      >
        {entry.name}
        {entry.quantity != null && (
          <span className="num ml-1 text-2xs text-ink-faint">
            {formatQuantity(entry.quantity, (entry.quantityUnit ?? "g") as QuantityUnit)}
          </span>
        )}
      </button>

      {/* Which front door wrote this. PRODUCT.md asks each path to make the
          other's work easy to see and verify, and until now nothing on screen
          distinguished a row Claude logged from one that was typed. Only the
          assistant is marked: the screen is the default, and badging every row
          would be noise. */}
      {entry.source === "mcp" && (
        <span
          className="shrink-0 rounded px-1 text-2xs uppercase tracking-wider text-ink-faint"
          style={{ border: "1px solid var(--line)" }}
          title="Logged by Claude"
        >
          ai
        </span>
      )}

      {/* Both front doors write here, so the row states when it happened —
          otherwise the interleaved order is unexplainable. This replaced the
          unlabelled P/C/F triplet, which was variable-width so it never formed
          a column, and whose totals are already in the meters above. Macros are
          still one tap away in the editor. */}
      <span className="num shrink-0 text-2xs text-ink-faint">
        {clockTime(entry.consumedAt)}
      </span>
      <span className="num w-14 shrink-0 text-right text-sm font-semibold text-ink">
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
