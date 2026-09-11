"use client";

import { useState } from "react";
import { api, type WeightLog } from "@/lib/api-client";
import { prettyDate, todayStr } from "@/lib/time-client";
import { LineChart } from "./MiniChart";
import { useToast } from "./Toast";

interface Props {
  date: string;
  logs: WeightLog[];
  weightUnit: string;
  onLogsChange: (logs: WeightLog[]) => void;
}

const dayOf = (v: string) =>
  new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function toLocalDateStr(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function WeightCard({ date, logs, weightUnit, onLogsChange }: Props) {
  const toast = useToast();
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Find entries matching the currently selected day
  const dayLogs = logs.filter((l) => toLocalDateStr(l.loggedAt) === date);
  const dayLog = dayLogs.length > 0 ? dayLogs[dayLogs.length - 1] : null;

  const chartData = logs.map((l) => ({ value: l.weight }));
  const latest = logs[logs.length - 1];
  const first = logs[0];
  const delta =
    latest && first && logs.length >= 2
      ? Math.round((latest.weight - first.weight) * 10) / 10
      : null;

  async function logWeight(e: React.FormEvent) {
    e.preventDefault();
    if (!weight) return;
    setSaving(true);
    try {
      const timestamp = date === todayStr() ? undefined : `${date}T12:00:00.000Z`;
      if (dayLog && isEditing) {
        await api.deleteWeight(dayLog.id).catch(() => {});
      }
      const { log } = await api.logWeight(Number(weight), timestamp);
      const remaining = dayLog && isEditing ? logs.filter((l) => l.id !== dayLog.id) : logs;
      const nextLogs = [...remaining, log].sort(
        (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime(),
      );
      onLogsChange(nextLogs);
      setWeight("");
      setIsEditing(false);
      toast(`Weight logged for ${prettyDate(date).toLowerCase()}`);
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
      toast("Weight entry removed", "info", {
        label: "Undo",
        onAct: async () => {
          await api.logWeight(doomed.weightKg, doomed.loggedAt, "kg");
          await api.listWeight().then(({ logs: fresh }) => onLogsChange(fresh)).catch(() => {});
        },
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove entry", "error");
    }
  }

  return (
    <section className="panel mt-2 p-3">
      {/* Header bar: Context label + Trend delta + History toggle */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
            Weight
          </span>
          <span className="text-2xs uppercase tracking-wider text-ink-faint">
            {prettyDate(date).toLowerCase()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {delta !== null && (
            <span
              className="num text-2xs text-ink-dim"
              title={`Change since ${dayOf(first.loggedAt)}`}
            >
              {delta > 0 ? "+" : ""}
              {delta} {weightUnit}
              <span className="ml-1 text-ink-faint">overall</span>
            </span>
          )}
          {logs.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((s) => !s)}
              aria-expanded={showHistory}
              className="num flex items-center gap-1 text-2xs uppercase tracking-wider text-ink-faint transition-colors hover:text-ink"
            >
              <span>{showHistory ? "close" : "trend"}</span>
              <span className="text-xs">{showHistory ? "−" : "+"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main content: Day's weight readout OR inline logging form */}
      {dayLog && !isEditing ? (
        <div className="mt-2 flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="num text-3xl font-bold leading-none text-ink">
              {dayLog.weight}
            </span>
            <span className="text-sm font-normal text-ink-faint">{weightUnit}</span>
            {latest && latest.id !== dayLog.id && (
              <span className="num ml-1 text-2xs text-ink-faint">
                (latest: {latest.weight} {weightUnit})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setWeight(String(dayLog.weight));
                setIsEditing(true);
              }}
              className="text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => deleteLog(dayLog)}
              aria-label={`Delete weight reading for ${prettyDate(date)}`}
              className="text-2xs font-semibold uppercase tracking-wider text-ink-faint transition-colors hover:text-over"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={logWeight} className="mt-2 flex items-center gap-1.5">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">
              Weight for {prettyDate(date)} in {weightUnit}
            </span>
            <input
              type="number"
              step="0.1"
              min={0}
              max={1000}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={latest ? String(latest.weight) : "0.0"}
              className="field num w-full pr-8"
              autoFocus={isEditing}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs uppercase text-ink-faint">
              {weightUnit}
            </span>
          </label>
          <button
            type="submit"
            disabled={saving || !weight}
            className="btn btn-primary shrink-0"
          >
            {saving ? "…" : isEditing ? "Save" : "Log"}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setWeight("");
              }}
              className="btn btn-ghost shrink-0"
            >
              Cancel
            </button>
          )}
        </form>
      )}

      {/* History & Trend Chart Disclosure */}
      {showHistory && logs.length > 0 && (
        <div className="mt-3 border-t pt-2.5" style={{ borderColor: "var(--line)" }}>
          {chartData.length >= 2 ? (
            <div className="h-24 overflow-hidden">
              <LineChart
                data={chartData}
                ariaLabel={`Weight trend across ${chartData.length} readings, from ${first.weight} to ${latest.weight} ${weightUnit}`}
                color="var(--accent)"
              />
            </div>
          ) : (
            <p className="py-2 text-center text-xs text-ink-faint">
              Log at least 2 readings to plot the trend line.
            </p>
          )}

          <div className="mt-2 flex items-baseline justify-between text-2xs uppercase tracking-wider text-ink-faint">
            <span>Recent readings</span>
            <span className="num">{logs.length} logged</span>
          </div>
          <ul
            className="mt-1 max-h-36 space-y-1 overflow-y-auto divide-y"
            style={{ borderColor: "var(--line-soft)" }}
          >
            {[...logs].reverse().map((l) => (
              <li key={l.id} className="flex items-center gap-2 pt-1 text-xs text-ink-dim">
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
        </div>
      )}
    </section>
  );
}
