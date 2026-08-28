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
    <section className="panel p-3">
      <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-dim">
        Daily goals
      </h2>
      <div className="grid grid-cols-4 gap-1.5">
        {(
          [
            ["kcal", "dailyCalories"],
            ["protein", "dailyProtein"],
            ["carbs", "dailyCarbs"],
            ["fat", "dailyFat"],
            ["fiber", "dailyFiber"],
            ["sugar", "dailySugar"],
            ["Na mg", "dailySodium"],
          ] as [string, keyof typeof form][]
        ).map(([label, key]) => (
          <label key={key} className="block">
            <span className="text-2xs uppercase tracking-wider text-ink-faint">
              {label}
            </span>
            <input
              type="number"
              min={0}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              placeholder="—"
              className="field num mt-0.5 w-full text-right"
            />
          </label>
        ))}
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">unit</span>
          <select
            value={form.weightUnit}
            onChange={(e) => setForm({ ...form, weightUnit: e.target.value })}
            className="field mt-0.5 w-full [&>option]:text-black"
          >
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </label>
      </div>
      <button onClick={save} disabled={saving} className="btn btn-primary mt-2.5 w-full">
        {saving ? "Saving…" : "Save goals"}
      </button>
    </section>
  );
}
