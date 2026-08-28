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
    <section className="panel p-5">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Weight</h2>
          {latest && (
            <p className="mt-1 text-3xl font-bold num text-ink">
              {latest.weight}
              <span className="ml-1 text-sm font-normal text-ink-faint">{weightUnit}</span>
            </p>
          )}
        </div>
        {logs.length >= 2 && (
          <span className={`rounded px-2 py-0.5 text-2xs font-semibold num ${delta <= 0 ? "text-ok" : "text-warn"}`}>
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
          className="flex-1 rounded border border-line bg-transparent px-3 py-2.5 text-sm num outline-none focus:border-accent"
        />
        <button type="submit" disabled={saving || !weight} className="rounded bg-accent px-5 py-2.5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-60">
          {saving ? "…" : "Log"}
        </button>
      </form>

      {logs.length > 0 && (
        <ul className="mt-4 space-y-1.5 max-h-40 overflow-y-auto">
          {[...logs].reverse().map((l) => (
            <li key={l.id} className="flex items-center justify-between text-xs text-ink-dim">
              <span>{new Date(l.loggedAt).toLocaleDateString()}</span>
              <span className="font-medium num text-ink">{l.weight} {weightUnit}</span>
              <button onClick={() => deleteLog(l.id)} className="text-ink-faint hover:text-over">×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
