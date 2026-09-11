"use client";

import { useState } from "react";
import { type Goals } from "@/lib/api-client";
import Select from "./Select";

export interface CalculatedGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sex: "male" | "female";
  birthYear: number;
  heightCm: number;
}

interface Props {
  goals: Goals;
  latestWeight: number | null; // in user's weightUnit
  onApply: (calc: CalculatedGoals) => void;
}

const ACTIVITY: { label: string; factor: number }[] = [
  { label: "Sedentary", factor: 1.2 },
  { label: "Light", factor: 1.375 },
  { label: "Moderate", factor: 1.55 },
  { label: "Active", factor: 1.725 },
  { label: "Very active", factor: 1.9 },
];
const GOAL_DELTA: Record<string, number> = { lose: -500, maintain: 0, gain: 300 };

export default function TdeeCard({ goals, latestWeight, onApply }: Props) {
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

  const ageN = Number(age);
  const heightCm = lb ? Number(height) * 2.54 : Number(height);
  const weightKg = lb ? Number(weightInput) * 0.453592 : Number(weightInput);
  const valid =
    ageN >= 1 &&
    ageN <= currentYear - 1900 &&
    heightCm >= 50 &&
    heightCm <= 300 &&
    weightKg > 0 &&
    weightKg <= 1000;

  let target = 0;
  let protein = 0,
    fat = 0,
    carbs = 0;
  if (valid) {
    const bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageN + (sex === "male" ? 5 : -161);
    const maintenance = bmr * factor;
    target = Math.round((maintenance + GOAL_DELTA[goalDir]) / 10) * 10;
    protein = Math.round(1.8 * weightKg);
    fat = Math.round((0.25 * target) / 9);
    carbs = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));
  }
  const estimable = valid && target > 0;

  function handleApply() {
    if (!estimable) return;
    onApply({
      calories: target,
      protein,
      carbs,
      fat,
      sex,
      birthYear: currentYear - ageN,
      heightCm: Math.round(heightCm),
    });
  }

  const inputCls = "field num mt-0.5 w-full";
  const selectWrap = "mt-0.5";

  return (
    <div>
      <p className="text-2xs text-ink-faint">Mifflin–St Jeor maintenance estimate based on body stats.</p>

      <div className="mt-2 grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-3">
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">Sex</span>
          <Select
            value={sex}
            onChange={(e) => setSex(e.target.value as "male" | "female")}
            wrapClassName={selectWrap}
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </label>
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">Age</span>
          <input
            type="number"
            min={1}
            max={currentYear - 1900}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="years"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">
            Height ({lb ? "in" : "cm"})
          </span>
          <input
            type="number"
            min={lb ? 20 : 50}
            max={lb ? 118 : 300}
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder={lb ? "in" : "cm"}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">
            Weight ({goals.weightUnit})
            {latestWeight && Number(weightInput) === latestWeight ? (
              <span className="ml-1 text-ink-dim">· scale</span>
            ) : null}
          </span>
          <input
            type="number"
            min={1}
            max={lb ? 2204 : 1000}
            step="0.1"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder="0.0"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">Activity</span>
          <Select
            value={factor}
            onChange={(e) => setFactor(Number(e.target.value))}
            wrapClassName={selectWrap}
          >
            {ACTIVITY.map((a) => (
              <option key={a.factor} value={a.factor}>
                {a.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">Goal</span>
          <Select
            value={goalDir}
            onChange={(e) => setGoalDir(e.target.value as "lose" | "maintain" | "gain")}
            wrapClassName={selectWrap}
          >
            <option value="lose">Lose (−500)</option>
            <option value="maintain">Maintain</option>
            <option value="gain">Gain (+300)</option>
          </Select>
        </label>
      </div>

      {estimable ? (
        <div
          className="mt-2.5 rounded border p-3 text-center"
          style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
        >
          <div className="num text-3xl font-bold text-ink">
            {target}
            <span className="ml-1 text-2xs uppercase tracking-wider text-ink-faint">
              kcal/day
            </span>
          </div>
          <div className="num mt-1 text-2xs text-ink-dim">
            P {protein}g · C {carbs}g · F {fat}g
          </div>
          <button
            type="button"
            onClick={handleApply}
            className="btn btn-primary mt-2.5 w-full"
          >
            Apply to daily goals
          </button>
        </div>
      ) : (
        <p className="mt-2.5 text-center text-2xs text-ink-faint">
          {valid
            ? "These values do not produce a usable estimate."
            : "Fill in age, height, and weight to calculate."}
        </p>
      )}
    </div>
  );
}
