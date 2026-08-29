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

const dayOf = (v: string) => new Date(v).toLocaleDateString();

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

  async function deleteLog(doomed: WeightLog) {
    try {
      await api.deleteWeight(doomed.id);
      onLogsChange(logs.filter((l) => l.id !== doomed.id));
      // Deleting a reading used to be silent and final. Re-logging it with its
      // original timestamp restores the point on the chart, not just the number.
      toast("Weight entry removed", "info", {
        label: "Undo",
        onAct: async () => {
          try {
            const { log } = await api.logWeight(doomed.weight, doomed.loggedAt);
            onLogsChange(
              [...logs.filter((l) => l.id !== doomed.id), log].sort(
                (a, b) => +new Date(a.loggedAt) - +new Date(b.loggedAt),
              ),
            );
          } catch (err) {
            toast(err instanceof Error ? err.message : "Could not restore it", "error");
          }
        },
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove entry", "error");
    }
  }

  const chartData = logs.map((l) => ({ value: l.weight }));
  const latest = logs[logs.length - 1];
  const first = logs[0];
  const delta = latest && first ? Math.round((latest.weight - first.weight) * 10) / 10 : 0;

  const form = (
    <form onSubmit={logWeight} className="mt-2 flex gap-1.5">
      <label className="min-w-0 flex-1">
        <span className="sr-only">Today&apos;s weight in {weightUnit}</span>
        <input
          type="number"
          step="0.1"
          min={0}
          max={1000}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder={`Today's weight (${weightUnit})`}
          className="field num w-full"
        />
      </label>
      <button type="submit" disabled={saving || !weight} className="btn btn-primary shrink-0">
        {saving ? "…" : "Log"}
      </button>
    </form>
  );

  if (logs.length === 0) {
    return (
      <section className="panel p-3">
        <span className="text-2xs uppercase tracking-wider text-ink-faint">Weight</span>
        <p className="mt-1.5 text-sm text-ink-dim">No readings yet.</p>
        <p className="mt-1 text-xs text-ink-faint">
          Two or more build the trend line, and feed the TDEE estimate in Settings.
        </p>
        {form}
      </section>
    );
  }

  return (
    <section className="panel p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-2xs uppercase tracking-wider text-ink-faint">Weight</span>
        {logs.length >= 2 && (
          // Deliberately not green-down / amber-up: the app does not know, and
          // must not imply, which direction is the user's goal. Colour in this
          // system means goal state only.
          <span className="num text-2xs text-ink-dim">
            {delta > 0 ? "+" : ""}
            {delta} {weightUnit} since {dayOf(first.loggedAt)}
          </span>
        )}
      </div>

      <p className="num mt-1 text-4xl font-bold leading-none text-ink">
        {latest.weight}
        <span className="ml-1 text-sm font-normal text-ink-faint">{weightUnit}</span>
      </p>

      {chartData.length >= 2 && (
        <div className="mt-2 h-24 overflow-hidden">
          <LineChart data={chartData} color="var(--accent)" />
        </div>
      )}

      {form}

      <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
        {[...logs].reverse().map((l) => (
          <li key={l.id} className="flex items-center gap-2 text-xs text-ink-dim">
            <span className="num flex-1">{dayOf(l.loggedAt)}</span>
            <span className="num font-semibold text-ink">
              {l.weight} {weightUnit}
            </span>
            <button
              onClick={() => deleteLog(l)}
              aria-label={`Delete the ${l.weight} ${weightUnit} reading from ${dayOf(l.loggedAt)}`}
              className="glyph-btn text-2xs text-ink-faint transition-colors hover:text-over"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
