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

  const inputCls =
    "w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm tnum outline-none focus:border-emerald-500 dark:border-white/10 [&>option]:text-slate-900";

  return (
    <section className="surface p-5">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">TDEE calculator</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Estimate maintenance calories and suggested goals (Mifflin–St Jeor).</p>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400">Sex</span>
          <select value={sex} onChange={(e) => setSex(e.target.value as "male" | "female")} className={inputCls}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400">Age</span>
          <input type="number" min={1} value={age} onChange={(e) => setAge(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400">Height ({lb ? "in" : "cm"})</span>
          <input type="number" min={1} value={height} onChange={(e) => setHeight(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400">Weight ({goals.weightUnit})</span>
          <input type="number" min={1} value={weightInput} onChange={(e) => setWeightInput(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400">Activity</span>
          <select value={factor} onChange={(e) => setFactor(Number(e.target.value))} className={inputCls}>
            {ACTIVITY.map((a) => <option key={a.factor} value={a.factor}>{a.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400">Goal</span>
          <select value={goalDir} onChange={(e) => setGoalDir(e.target.value as "lose" | "maintain" | "gain")} className={inputCls}>
            <option value="lose">Lose (−500)</option>
            <option value="maintain">Maintain</option>
            <option value="gain">Gain (+300)</option>
          </select>
        </label>
      </div>

      {valid ? (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-center dark:bg-white/5">
          <div className="text-3xl font-bold tnum text-slate-900 dark:text-white">{target}<span className="ml-1 text-sm font-normal text-slate-400">kcal/day</span></div>
          <div className="mt-1 text-xs tnum text-slate-500 dark:text-slate-400">P {protein}g · C {carbs}g · F {fat}g</div>
          <button onClick={apply} disabled={saving} className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60">
            {saving ? "Applying…" : "Apply as goals"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-center text-xs text-slate-400">Fill in age, height, and weight to calculate.</p>
      )}
    </section>
  );
}
