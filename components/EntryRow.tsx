"use client";

import { useState } from "react";
import { api, type FoodEntry } from "@/lib/api-client";
import { useToast } from "./Toast";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

interface Props {
  entry: FoodEntry;
  onUpdate: (e: FoodEntry) => void;
  onDelete: (id: string) => void;
}

export default function EntryRow({ entry, onUpdate, onDelete }: Props) {
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
  });

  async function save() {
    setSaving(true);
    try {
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
    return (
      <li className="px-3 py-2" style={{ background: "var(--panel-2)" }}>
        <div className="grid grid-cols-4 gap-1.5">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="field col-span-4"
          />
          {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
            <input
              key={k}
              type="number"
              min={0}
              step="any"
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              placeholder={k === "calories" ? "kcal" : k[0].toUpperCase()}
              className="field num text-right"
            />
          ))}
          {(["fiber", "sugar", "sodium"] as const).map((k) => (
            <input
              key={k}
              type="number"
              min={0}
              step="any"
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              placeholder={k === "sodium" ? "Na" : k}
              className="field num text-right"
            />
          ))}
          <select
            value={form.mealType}
            onChange={(e) => setForm({ ...form, mealType: e.target.value as FoodEntry["mealType"] })}
            className="field capitalize [&>option]:text-black"
          >
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
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
    <li className="group flex items-baseline gap-2 px-3 py-1.5">
      <button
        onClick={() => setEditing(true)}
        className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-accent"
        title="Edit"
      >
        {entry.name}
        {entry.quantityGrams != null && (
          <span className="num ml-1 text-2xs text-ink-faint">
            {entry.quantityGrams}g
          </span>
        )}
      </button>

      <span className="num shrink-0 text-2xs text-ink-faint">
        {entry.protein}/{entry.carbs}/{entry.fat}
      </span>
      <span className="num w-14 shrink-0 text-right text-sm font-semibold text-ink">
        {entry.calories}
      </span>
      <button
        onClick={() => onDelete(entry.id)}
        className="shrink-0 text-2xs text-ink-faint opacity-0 transition-opacity hover:text-over group-hover:opacity-100 focus:opacity-100"
        aria-label={`Delete ${entry.name}`}
      >
        ✕
      </button>
    </li>
  );
}
