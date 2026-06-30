"use client";

import { useState } from "react";
import { api, type WeightLog } from "@/lib/api-client";
import { LineChart } from "./MiniChart";
import { useToast } from "./Toast";

interface Props {
  logs: WeightLog[];
  weightUnit: string;
  onLogsChange: (logs: WeightLog[]) => void;
}

export default function WeightCard({ logs, weightUnit, onLogsChange }: Props) {
  const toast = useToast();
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);

  async function logWeight(e: React.FormEvent) {
    e.preventDefault();
    if (!weight) return;
    setSaving(true);
    try {
      const { log } = await api.logWeight(Number(weight));
      onLogsChange([...logs, log]);
      setWeight("");
      toast("Weight logged");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to log weight", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLog(id: string) {
    await api.deleteWeight(id);
    onLogsChange(logs.filter((l) => l.id !== id));
    toast("Weight entry removed", "info");
  }

  const chartData = logs.map((l) => ({ value: l.weight }));
  const latest = logs[logs.length - 1];
  const first = logs[0];
  const delta = latest && first ? latest.weight - first.weight : 0;

  return (
    <section className="surface p-5">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Weight</h2>
          {latest && (
            <p className="mt-1 text-3xl font-bold tnum text-slate-900 dark:text-white">
              {latest.weight}
              <span className="ml-1 text-sm font-normal text-slate-400">{weightUnit}</span>
            </p>
          )}
        </div>
        {logs.length >= 2 && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tnum ${delta <= 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"}`}>
            {delta > 0 ? "+" : ""}{Math.round(delta * 10) / 10} {weightUnit}
          </span>
        )}
      </div>

      {chartData.length >= 2 && (
        <div className="mb-4 h-24 overflow-hidden">
          <LineChart data={chartData} color="#f59e0b" />
        </div>
      )}

      <form onSubmit={logWeight} className="flex gap-2">
        <input
          type="number"
          step="0.1"
          min={0}
          max={1000}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder={`Today's weight (${weightUnit})`}
          className="flex-1 rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm tnum outline-none focus:border-emerald-500 dark:border-white/10"
        />
        <button type="submit" disabled={saving || !weight} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60">
          {saving ? "…" : "Log"}
        </button>
      </form>

      {logs.length > 0 && (
        <ul className="mt-4 space-y-1.5 max-h-40 overflow-y-auto">
          {[...logs].reverse().map((l) => (
            <li key={l.id} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>{new Date(l.loggedAt).toLocaleDateString()}</span>
              <span className="font-medium tnum text-slate-800 dark:text-slate-200">{l.weight} {weightUnit}</span>
              <button onClick={() => deleteLog(l.id)} className="text-slate-300 hover:text-rose-400 dark:text-slate-600">×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
