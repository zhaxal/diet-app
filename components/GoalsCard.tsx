"use client";

import { useState } from "react";
import { api, type Goals } from "@/lib/api-client";
import Select from "./Select";
import TdeeCard from "./TdeeCard";
import { useToast } from "./Toast";

interface Props {
  goals: Goals;
  latestWeight: number | null;
  onGoalsChange: (g: Goals) => void;
}

export default function GoalsCard({ goals, latestWeight, onGoalsChange }: Props) {
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
  const [profile, setProfile] = useState({
    sex: goals.sex,
    birthYear: goals.birthYear,
    heightCm: goals.heightCm,
  });
  const [showCalculator, setShowCalculator] = useState(false);
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
        sex: profile.sex ?? goals.sex,
        birthYear: profile.birthYear ?? goals.birthYear,
        heightCm: profile.heightCm ?? goals.heightCm,
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

      {/* Nested TDEE / Body Profile Calculator */}
      <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
        <button
          type="button"
          onClick={() => setShowCalculator((s) => !s)}
          aria-expanded={showCalculator}
          className="flex w-full items-center justify-between py-1 text-2xs font-semibold uppercase tracking-wider text-ink-dim transition-colors hover:text-ink"
        >
          <span>Calculate from TDEE / Profile</span>
          <span className="num text-xs text-ink-faint">{showCalculator ? "−" : "+"}</span>
        </button>

        {showCalculator && (
          <div className="mt-2 border-t pt-2.5" style={{ borderColor: "var(--line-soft)" }}>
            <TdeeCard
              goals={goals}
              latestWeight={latestWeight}
              onApply={(calc) => {
                setForm((prev) => ({
                  ...prev,
                  dailyCalories: String(calc.calories),
                  dailyProtein: String(calc.protein),
                  dailyCarbs: String(calc.carbs),
                  dailyFat: String(calc.fat),
                }));
                setProfile({
                  sex: calc.sex,
                  birthYear: calc.birthYear,
                  heightCm: calc.heightCm,
                });
                toast("Calculated targets filled into form. Review and save below.");
              }}
            />
          </div>
        )}
      </div>

      <button onClick={save} disabled={saving} className="btn btn-primary mt-2.5 w-full">
        {saving ? "Saving…" : "Save goals"}
      </button>
    </section>
  );
}
