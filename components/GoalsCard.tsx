"use client";

import { useState } from "react";
import { api, type Goals } from "@/lib/api-client";
import Select from "./Select";
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
      <div className="grid grid-cols-2 gap-1.5 min-[380px]:grid-cols-4">
        {(
          [
            ["kcal", "dailyCalories", 100000],
            ["protein", "dailyProtein", 1000000],
            ["carbs", "dailyCarbs", 1000000],
            ["fat", "dailyFat", 1000000],
            ["fiber", "dailyFiber", 1000000],
            ["sugar", "dailySugar", 1000000],
            ["Sodium mg", "dailySodium", 1000000],
          ] as [string, keyof typeof form, number][]
        ).map(([label, key, max]) => (
          <label key={key} className="block">
            <span className="text-2xs uppercase tracking-wider text-ink-faint">
              {label}
            </span>
            <input
              type="number"
              min={0}
              max={max}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              placeholder="—"
              className="field num mt-0.5 w-full text-right"
            />
          </label>
        ))}
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">
            <span className="sr-only">Weight </span>Unit
          </span>
          <Select
            value={form.weightUnit}
            onChange={(e) => setForm({ ...form, weightUnit: e.target.value as "kg" | "lb" })}
            wrapClassName="mt-0.5"
          >
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </Select>
        </label>
      </div>
      {/* This setting used to be a label with no conversion behind it: switching
          it reinterpreted every stored reading instead of re-rendering it.
          Readings are canonical kilograms now, so the switch is safe — and
          saying so is worth two lines, because the old behaviour means readings
          taken before the change were read as whatever this was set to then. */}
      <p className="mt-2 text-2xs text-ink-faint">
        Weight is stored in kilograms and converted for display, so changing the
        unit re-renders your history rather than reinterpreting it.
      </p>
      <button onClick={save} disabled={saving} className="btn btn-primary mt-2.5 w-full">
        {saving ? "Saving…" : "Save goals"}
      </button>
    </section>
  );
}
