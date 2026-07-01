"use client";

import { useState } from "react";
import { api, type Goals } from "@/lib/api-client";
import { useToast } from "./Toast";

interface Props {
  goals: Goals;
  onGoalsChange: (g: Goals) => void;
}

export default function GoalsCard({ goals, onGoalsChange }: Props) {
  const toast = useToast();
  const [form, setForm] = useState({
    dailyCalories: goals.dailyCalories?.toString() ?? "",
    dailyProtein: goals.dailyProtein?.toString() ?? "",
    dailyCarbs: goals.dailyCarbs?.toString() ?? "",
    dailyFat: goals.dailyFat?.toString() ?? "",
    dailyFiber: goals.dailyFiber?.toString() ?? "",
    dailySugar: goals.dailySugar?.toString() ?? "",
    dailySodium: goals.dailySodium?.toString() ?? "",
    weightUnit: goals.weightUnit,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { goals: updated } = await api.saveGoals({
        dailyCalories: form.dailyCalories ? Number(form.dailyCalories) : null,
        dailyProtein: form.dailyProtein ? Number(form.dailyProtein) : null,
        dailyCarbs: form.dailyCarbs ? Number(form.dailyCarbs) : null,
        dailyFat: form.dailyFat ? Number(form.dailyFat) : null,
        dailyFiber: form.dailyFiber ? Number(form.dailyFiber) : null,
        dailySugar: form.dailySugar ? Number(form.dailySugar) : null,
        dailySodium: form.dailySodium ? Number(form.dailySodium) : null,
        weightUnit: form.weightUnit as "kg" | "lb",
      });
      onGoalsChange(updated);
      toast("Goals saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save goals", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface p-5">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Daily goals</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {(
          [
            ["Calories", "dailyCalories", "kcal"],
            ["Protein", "dailyProtein", "g"],
            ["Carbs", "dailyCarbs", "g"],
            ["Fat", "dailyFat", "g"],
            ["Fiber", "dailyFiber", "g"],
            ["Sugar", "dailySugar", "g"],
            ["Sodium", "dailySodium", "mg"],
          ] as [string, keyof typeof form, string][]
        ).map(([label, key, unit]) => (
          <label key={key} className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">{label} ({unit})</span>
            <input
              type="number"
              min={0}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              placeholder="—"
              className="mt-0.5 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm tnum outline-none focus:border-emerald-500 dark:border-white/10"
            />
          </label>
        ))}
      </div>
      <label className="mt-2.5 block">
        <span className="text-xs text-slate-500 dark:text-slate-400">Weight unit</span>
        <select
          value={form.weightUnit}
          onChange={(e) => setForm({ ...form, weightUnit: e.target.value })}
          className="mt-0.5 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 [&>option]:text-slate-900"
        >
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </select>
      </label>
      <button
        onClick={save}
        disabled={saving}
        className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save goals"}
      </button>
    </section>
  );
}
