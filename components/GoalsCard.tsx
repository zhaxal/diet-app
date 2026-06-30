"use client";

import { useState } from "react";
import { api, type Goals, type Totals } from "@/lib/api-client";

function ProgressBar({ label, value, goal, unit }: { label: string; value: number; goal: number | null; unit: string }) {
  const pct = goal ? Math.min(Math.round((value / goal) * 100), 100) : null;
  const over = goal ? value > goal : false;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span className="font-medium">{label}</span>
        <span>
          {Math.round(value * 10) / 10}
          {goal ? ` / ${goal}` : ""} {unit}
          {pct != null && <span className={`ml-1 ${over ? "text-red-500" : "text-slate-400"}`}>({pct}%)</span>}
        </span>
      </div>
      {goal && (
        <div className="h-1.5 rounded-full bg-slate-100">
          <div
            className={`h-1.5 rounded-full transition-all ${over ? "bg-red-400" : "bg-emerald-500"}`}
            style={{ width: `${Math.min((value / goal) * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface Props {
  goals: Goals;
  total: Totals;
  onGoalsChange: (g: Goals) => void;
}

export default function GoalsCard({ goals, total, onGoalsChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    dailyCalories: goals.dailyCalories?.toString() ?? "",
    dailyProtein: goals.dailyProtein?.toString() ?? "",
    dailyCarbs: goals.dailyCarbs?.toString() ?? "",
    dailyFat: goals.dailyFat?.toString() ?? "",
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
        weightUnit: form.weightUnit as "kg" | "lb",
      });
      onGoalsChange(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Daily goals</h2>
        <button
          onClick={() => setEditing((e) => !e)}
          className="text-xs text-emerald-600 hover:underline"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["Calories", "dailyCalories", "kcal"],
                ["Protein", "dailyProtein", "g"],
                ["Carbs", "dailyCarbs", "g"],
                ["Fat", "dailyFat", "g"],
              ] as [string, keyof typeof form, string][]
            ).map(([label, key, unit]) => (
              <label key={key} className="block">
                <span className="text-xs text-slate-500">{label} ({unit})</span>
                <input
                  type="number"
                  min={0}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder="—"
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
          <label className="block">
            <span className="text-xs text-slate-500">Weight unit</span>
            <select
              value={form.weightUnit}
              onChange={(e) => setForm({ ...form, weightUnit: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-lg bg-emerald-600 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save goals"}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <ProgressBar label="Calories" value={total.calories} goal={goals.dailyCalories} unit="kcal" />
          <ProgressBar label="Protein" value={total.protein} goal={goals.dailyProtein} unit="g" />
          <ProgressBar label="Carbs" value={total.carbs} goal={goals.dailyCarbs} unit="g" />
          <ProgressBar label="Fat" value={total.fat} goal={goals.dailyFat} unit="g" />
          {!goals.dailyCalories && !goals.dailyProtein && (
            <p className="text-xs text-slate-400 text-center pt-1">No goals set — click Edit to add targets</p>
          )}
        </div>
      )}
    </section>
  );
}
