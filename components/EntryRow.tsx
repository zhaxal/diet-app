"use client";

import { useState } from "react";
import { api, type FoodEntry } from "@/lib/api-client";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

interface Props {
  entry: FoodEntry;
  onUpdate: (e: FoodEntry) => void;
  onDelete: (id: string) => void;
}

export default function EntryRow({ entry, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: entry.name,
    calories: entry.calories.toString(),
    protein: entry.protein.toString(),
    carbs: entry.carbs.toString(),
    fat: entry.fat.toString(),
    mealType: entry.mealType,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { entry: updated } = await api.updateEntry(entry.id, {
        name: form.name,
        calories: Number(form.calories),
        protein: Number(form.protein),
        carbs: Number(form.carbs),
        fat: Number(form.fat),
        mealType: form.mealType as FoodEntry["mealType"],
      });
      onUpdate(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Food name"
          />
          <select
            value={form.mealType}
            onChange={(e) => setForm({ ...form, mealType: e.target.value as typeof MEALS[number] })}
            className="rounded border border-slate-300 px-2 py-1 text-sm capitalize"
          >
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
            <input
              key={k}
              type="number"
              min={0}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              placeholder={k}
              className="w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded bg-emerald-600 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="flex-1 rounded border border-slate-300 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <p className="text-xs text-slate-500">
          {entry.calories} kcal · P{entry.protein} · C{entry.carbs} · F{entry.fat}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-slate-400 hover:text-emerald-600"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          className="text-xs text-slate-400 hover:text-red-600"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
