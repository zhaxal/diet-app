"use client";

import { useState } from "react";
import { type Trends } from "@/lib/api-client";
import { BarChart, LineChart } from "./MiniChart";

interface Props {
  trends: Trends;
  weightUnit: string;
  onDaysChange: (days: 7 | 30) => void;
}

export default function TrendsCard({ trends, weightUnit, onDaysChange }: Props) {
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
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Trends</h2>
        <div className="flex gap-1 text-xs">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`rounded px-2 py-0.5 ${trends.days === d ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 mb-3 text-xs">
        {(["calories", "protein", "weight"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-2 py-0.5 capitalize ${tab === t ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="h-20 overflow-hidden">
        {tab === "calories" && <BarChart data={calData} color="#10b981" />}
        {tab === "protein" && <BarChart data={proteinData} color="#6366f1" />}
        {tab === "weight" && (
          weightData.length >= 2
            ? <LineChart data={weightData} color="#f59e0b" />
            : <p className="text-xs text-slate-400 text-center pt-6">Log at least 2 weight entries to see the trend</p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs text-slate-500">
        <div><div className="font-semibold text-slate-700">{avg("calories")}</div><div>avg kcal</div></div>
        <div><div className="font-semibold text-slate-700">{avg("protein")}g</div><div>avg protein</div></div>
        <div><div className="font-semibold text-slate-700">{avg("carbs")}g</div><div>avg carbs</div></div>
        <div><div className="font-semibold text-slate-700">{avg("fat")}g</div><div>avg fat</div></div>
      </div>
    </section>
  );
}
