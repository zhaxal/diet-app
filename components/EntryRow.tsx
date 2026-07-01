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

  const inputCls =
    "rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-sm outline-none focus:border-emerald-500 dark:border-white/10";

  if (editing) {
    return (
      <li className="px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`flex-1 ${inputCls}`} placeholder="Food name" />
          <select
            value={form.mealType}
            onChange={(e) => setForm({ ...form, mealType: e.target.value as (typeof MEALS)[number] })}
            className={`capitalize ${inputCls} [&>option]:text-slate-900`}
          >
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
            <input key={k} type="number" min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={k} className={`w-0 flex-1 tnum text-xs ${inputCls}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {(["fiber", "sugar", "sodium"] as const).map((k) => (
            <input key={k} type="number" min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={k} className={`w-0 flex-1 tnum text-xs ${inputCls}`} />
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="flex-1 rounded-lg border border-slate-300 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{entry.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 tnum">
          {entry.calories} kcal · P{entry.protein} · C{entry.carbs} · F{entry.fat}
          {(entry.fiber > 0 || entry.sugar > 0 || entry.sodium > 0) && (
            <span className="text-slate-400 dark:text-slate-500">
              {entry.fiber > 0 ? ` · fiber ${entry.fiber}` : ""}
              {entry.sugar > 0 ? ` · sugar ${entry.sugar}` : ""}
              {entry.sodium > 0 ? ` · Na ${entry.sodium}mg` : ""}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-3">
        <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400">Edit</button>
        <button onClick={() => onDelete(entry.id)} className="text-xs text-slate-400 hover:text-rose-500">Delete</button>
      </div>
    </li>
  );
}
