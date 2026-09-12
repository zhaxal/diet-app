"use client";

import { useState } from "react";
import { api, type Goals } from "@/lib/api-client";
import { useAnimatedDisclosure } from "@/lib/useAnimatedDisclosure";
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
      const previousGoals = { ...goals };
      onGoalsChange(updated);
      toast("Goals saved", "info", {
        label: "Undo",
        onAct: async () => {
          try {
            const { goals: reverted } = await api.saveGoals({
              dailyCalories: previousGoals.dailyCalories,
              dailyProtein: previousGoals.dailyProtein,
              dailyCarbs: previousGoals.dailyCarbs,
              dailyFat: previousGoals.dailyFat,
              dailyFiber: previousGoals.dailyFiber,
              dailySugar: previousGoals.dailySugar,
              dailySodium: previousGoals.dailySodium,
              weightUnit: previousGoals.weightUnit,
              sex: previousGoals.sex,
              birthYear: previousGoals.birthYear,
              heightCm: previousGoals.heightCm,
            });
            onGoalsChange(reverted);
            setForm({
              dailyCalories: reverted.dailyCalories != null ? String(reverted.dailyCalories) : "",
              dailyProtein: reverted.dailyProtein != null ? String(reverted.dailyProtein) : "",
              dailyCarbs: reverted.dailyCarbs != null ? String(reverted.dailyCarbs) : "",
              dailyFat: reverted.dailyFat != null ? String(reverted.dailyFat) : "",
              dailyFiber: reverted.dailyFiber != null ? String(reverted.dailyFiber) : "",
              dailySugar: reverted.dailySugar != null ? String(reverted.dailySugar) : "",
              dailySodium: reverted.dailySodium != null ? String(reverted.dailySodium) : "",
              weightUnit: reverted.weightUnit,
            });
            toast("Goals reverted", "info");
          } catch {
            toast("Failed to revert goals", "error");
          }
        },
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save goals", "error");
    } finally {
      setSaving(false);
    }
  }

  const hasMicrosSet = Boolean(
    goals.dailyFiber || goals.dailySugar || goals.dailySodium
  );
  const [showMicros, setShowMicros] = useState(hasMicrosSet);
  const micros = useAnimatedDisclosure(showMicros);
  const calculator = useAnimatedDisclosure(showCalculator);

  const PRIMARY_FIELDS = [
    { label: "kcal", key: "dailyCalories", max: 100000 },
    { label: "protein g", key: "dailyProtein", max: 1000000 },
    { label: "carbs g", key: "dailyCarbs", max: 1000000 },
    { label: "fat g", key: "dailyFat", max: 1000000 },
  ] as const;

  const MICRO_FIELDS = [
    { label: "fiber g", key: "dailyFiber", max: 1000000 },
    { label: "sugar g", key: "dailySugar", max: 1000000 },
    { label: "sodium mg", key: "dailySodium", max: 1000000 },
  ] as const;

  return (
    <section className="panel p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
          Daily goals
        </h2>
        <label className="flex items-center gap-1 text-2xs uppercase tracking-wider text-ink-faint">
          <span>Unit</span>
          <Select
            value={form.weightUnit}
            onChange={(e) => setForm({ ...form, weightUnit: e.target.value as "kg" | "lb" })}
            className="py-0.5 text-xs"
          >
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </Select>
        </label>
      </div>

      {/* Primary Target Macros */}
      <div className="grid grid-cols-2 gap-1.5 min-[380px]:grid-cols-4">
        {PRIMARY_FIELDS.map(({ label, key, max }) => (
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
      </div>

      {/* Progressive Disclosure for Micronutrients & Trace */}
      <div className="mt-2.5">
        <button
          type="button"
          onClick={() => setShowMicros((s) => !s)}
          aria-expanded={showMicros}
          className="flex items-center gap-1 text-2xs uppercase tracking-wider text-ink-faint hover:text-ink transition-colors"
        >
          <span>{showMicros ? "− fewer" : "+ Micronutrients"}</span>
          {!showMicros && (
            <span className="text-ink-faint/60 lowercase tracking-normal">
              (fiber, sugar, sodium)
            </span>
          )}
        </button>

        {micros.rendered && (
          <div
            onAnimationEnd={micros.onAnimationEnd}
            className={`motion-disclosure-content ${micros.closing ? "motion-disclosure-content--closing" : ""} mt-2 grid grid-cols-3 gap-1.5 border-t pt-2`}
            style={{ borderColor: "var(--line-soft)" }}
          >
            {MICRO_FIELDS.map(({ label, key, max }) => (
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
          </div>
        )}
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

        {calculator.rendered && (
          <div
            onAnimationEnd={calculator.onAnimationEnd}
            className={`motion-disclosure-content ${calculator.closing ? "motion-disclosure-content--closing" : ""} mt-2 border-t pt-2.5`}
            style={{ borderColor: "var(--line-soft)" }}
          >
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
