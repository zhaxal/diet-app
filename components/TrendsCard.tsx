"use client";

import { useState } from "react";
import { type Trends } from "@/lib/api-client";
import { BarChart, LineChart } from "./MiniChart";

interface Props {
  trends: Trends;
  onDaysChange: (days: 7 | 30) => void;
}

export default function TrendsCard({ trends, onDaysChange }: Props) {
  const [tab, setTab] = useState<"calories" | "protein" | "weight">("calories");

  const calData = trends.nutrition.map((d) => ({ label: d.date.slice(5), value: d.calories }));
  const proteinData = trends.nutrition.map((d) => ({ label: d.date.slice(5), value: d.protein }));
  const weightData = trends.weight.map((d) => ({ value: d.value }));

  const avg = (key: "calories" | "protein" | "carbs" | "fat") => {
    const active = trends.nutrition.filter((d) => d.count > 0);
    if (active.length === 0) return 0;
    return Math.round(active.reduce((s, d) => s + d[key], 0) / active.length);
  };

  return (
    <section className="surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Trends</h2>
        <div className="flex gap-1 rounded-full bg-slate-100 p-0.5 text-xs dark:bg-white/10">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${trends.days === d ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 mb-4 text-xs">
        {(["calories", "protein", "weight"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 capitalize font-medium transition-colors ${tab === t ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="h-28 overflow-hidden">
        {tab === "calories" && <BarChart data={calData} color="#10b981" />}
        {tab === "protein" && <BarChart data={proteinData} color="#6366f1" />}
        {tab === "weight" && (
          weightData.length >= 2
            ? <LineChart data={weightData} color="#f59e0b" />
            : <p className="pt-10 text-center text-xs text-slate-400">Log at least 2 weight entries to see the trend</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {([["calories", "kcal"], ["protein", "g protein"], ["carbs", "g carbs"], ["fat", "g fat"]] as const).map(([k, label]) => (
          <div key={k} className="rounded-xl bg-slate-50 py-2 dark:bg-white/5">
            <div className="text-sm font-bold tnum text-slate-800 dark:text-slate-100">{avg(k)}</div>
            <div className="text-[10px] text-slate-400">{label}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-400">daily averages over {trends.days} days</p>
    </section>
  );
}
