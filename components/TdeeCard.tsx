"use client";

import { useState } from "react";
import { api, type Goals } from "@/lib/api-client";
import { useToast } from "./Toast";

interface Props {
  goals: Goals;
  latestWeight: number | null; // in the user's weightUnit
  onGoalsChange: (g: Goals) => void;
}

const ACTIVITY: { label: string; factor: number }[] = [
  { label: "Sedentary", factor: 1.2 },
  { label: "Light", factor: 1.375 },
  { label: "Moderate", factor: 1.55 },
  { label: "Active", factor: 1.725 },
  { label: "Very active", factor: 1.9 },
];
const GOAL_DELTA: Record<string, number> = { lose: -500, maintain: 0, gain: 300 };

export default function TdeeCard({ goals, latestWeight, onGoalsChange }: Props) {
  const toast = useToast();
  const lb = goals.weightUnit === "lb";
  const currentYear = new Date().getFullYear();

  const [sex, setSex] = useState<"male" | "female">(goals.sex ?? "male");
  const [age, setAge] = useState(goals.birthYear ? String(currentYear - goals.birthYear) : "");
  const [height, setHeight] = useState(
    goals.heightCm ? String(lb ? Math.round(goals.heightCm / 2.54) : goals.heightCm) : "",
  );
  const [weightInput, setWeightInput] = useState(latestWeight ? String(latestWeight) : "");
  const [factor, setFactor] = useState(1.375);
  const [goalDir, setGoalDir] = useState<"lose" | "maintain" | "gain">("maintain");
  const [saving, setSaving] = useState(false);

  const ageN = Number(age);
  const heightCm = lb ? Number(height) * 2.54 : Number(height);
  const weightKg = lb ? Number(weightInput) * 0.453592 : Number(weightInput);
  const valid = ageN > 0 && heightCm > 0 && weightKg > 0;

  let target = 0;
  let protein = 0, fat = 0, carbs = 0;
  if (valid) {
    const bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageN + (sex === "male" ? 5 : -161);
    const maintenance = bmr * factor;
    target = Math.round((maintenance + GOAL_DELTA[goalDir]) / 10) * 10;
    protein = Math.round(1.8 * weightKg);
    fat = Math.round((0.25 * target) / 9);
    carbs = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));
  }

  async function apply() {
    setSaving(true);
    try {
      const { goals: updated } = await api.saveGoals({
        dailyCalories: target,
        dailyProtein: protein,
        dailyCarbs: carbs,
        dailyFat: fat,
        sex,
        birthYear: currentYear - ageN,
        heightCm: Math.round(heightCm),
      });
      onGoalsChange(updated);
      toast("Goals updated from TDEE");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to apply", "error");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "field num mt-0.5 w-full [&>option]:text-black";

  return (
    <section className="panel p-3">
      <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">TDEE calculator</h2>
      <p className="mt-1 text-2xs text-ink-faint">Mifflin–St Jeor maintenance estimate.</p>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">Sex</span>
          <select value={sex} onChange={(e) => setSex(e.target.value as "male" | "female")} className={inputCls}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">Age</span>
          <input type="number" min={1} value={age} onChange={(e) => setAge(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">Height ({lb ? "in" : "cm"})</span>
          <input type="number" min={1} value={height} onChange={(e) => setHeight(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">Weight ({goals.weightUnit})</span>
          <input type="number" min={1} value={weightInput} onChange={(e) => setWeightInput(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">Activity</span>
          <select value={factor} onChange={(e) => setFactor(Number(e.target.value))} className={inputCls}>
            {ACTIVITY.map((a) => <option key={a.factor} value={a.factor}>{a.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">Goal</span>
          <select value={goalDir} onChange={(e) => setGoalDir(e.target.value as "lose" | "maintain" | "gain")} className={inputCls}>
            <option value="lose">Lose (−500)</option>
            <option value="maintain">Maintain</option>
            <option value="gain">Gain (+300)</option>
          </select>
        </label>
      </div>

      {valid ? (
        <div className="mt-2.5 rounded border p-3 text-center" style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}>
          <div className="num text-3xl font-bold text-ink">{target}<span className="ml-1 text-2xs uppercase tracking-wider text-ink-faint">kcal/day</span></div>
          <div className="num mt-1 text-2xs text-ink-dim">P {protein}g · C {carbs}g · F {fat}g</div>
          <button onClick={apply} disabled={saving} className="btn btn-primary mt-2.5 w-full">
            {saving ? "Applying…" : "Apply as goals"}
          </button>
        </div>
      ) : (
        <p className="mt-2.5 text-center text-2xs text-ink-faint">Fill in age, height, and weight to calculate.</p>
      )}
    </section>
  );
}
