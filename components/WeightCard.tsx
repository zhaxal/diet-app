"use client";

import { useState } from "react";
import { api, type WeightLog } from "@/lib/api-client";
import { LineChart } from "./MiniChart";

interface Props {
  logs: WeightLog[];
  weightUnit: string;
  onLogsChange: (logs: WeightLog[]) => void;
}

export default function WeightCard({ logs, weightUnit, onLogsChange }: Props) {
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logWeight(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!weight) return;
    setSaving(true);
    try {
      const { log } = await api.logWeight(Number(weight));
      onLogsChange([...logs, log]);
      setWeight("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log weight");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLog(id: string) {
    await api.deleteWeight(id);
    onLogsChange(logs.filter((l) => l.id !== id));
  }

  const chartData = logs.map((l) => ({ value: l.weight }));
  const latest = logs[logs.length - 1];

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Weight</h2>
        {latest && (
          <span className="text-sm font-semibold text-slate-700">
            {latest.weight} <span className="text-xs font-normal text-slate-400">{weightUnit}</span>
          </span>
        )}
      </div>

      {chartData.length >= 2 && (
        <div className="mb-3 h-20 overflow-hidden">
          <LineChart data={chartData} />
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
          placeholder={`Weight (${weightUnit})`}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={saving || !weight}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "…" : "Log"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {logs.length > 0 && (
        <ul className="mt-3 space-y-1 max-h-32 overflow-y-auto">
          {[...logs].reverse().map((l) => (
            <li key={l.id} className="flex items-center justify-between text-xs text-slate-600">
              <span>{new Date(l.loggedAt).toLocaleDateString()}</span>
              <span className="font-medium">{l.weight} {weightUnit}</span>
              <button onClick={() => deleteLog(l.id)} className="text-slate-300 hover:text-red-400">×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
