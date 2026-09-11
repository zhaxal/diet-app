"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface WorkoutSummaryCardProps {
  weightUnit: string;
  refreshTrigger?: number;
}

interface SummaryData {
  periodDays: number;
  totalWorkouts: number;
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  displayUnit: string;
  muscleGroups: Record<string, { sets: number; percentage: number }>;
}

export default function WorkoutSummaryCard({
  weightUnit,
  refreshTrigger = 0,
}: WorkoutSummaryCardProps) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getWorkoutSummary(30)
      .then((res) => {
        if (!cancelled && res.summary) {
          setData(res.summary);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshTrigger]);

  if (!data || data.totalWorkouts === 0) {
    return null;
  }

  return (
    <div
      className="panel p-3 mb-3 text-xs"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
          30-Day Training Summary
        </h3>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-ink-faint hover:text-ink transition-colors"
          aria-expanded={expanded}
        >
          <span>{expanded ? "Hide details" : "Details"}</span>
          <span className="num text-xs font-mono">{expanded ? "−" : "+"}</span>
        </button>
      </div>

      {/* Primary Metrics Row - Unified Hairline Panel */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-px mt-2 overflow-hidden rounded border border-line"
        style={{ background: "var(--line)" }}
      >
        <div className="p-2.5 text-left" style={{ background: "var(--panel-2)" }}>
          <div className="text-2xs text-ink-faint uppercase tracking-wider">Sessions</div>
          <div className="num text-sm font-bold text-ink mt-0.5">{data.totalWorkouts}</div>
        </div>

        <div className="p-2.5 text-left" style={{ background: "var(--panel-2)" }}>
          <div className="text-2xs text-ink-faint uppercase tracking-wider">Volume</div>
          <div className="num text-sm font-bold text-ink mt-0.5">
            {Math.round(data.totalVolume).toLocaleString()}
            <span className="text-2xs font-normal text-ink-faint ml-0.5">{weightUnit}</span>
          </div>
        </div>

        <div className="p-2.5 text-left" style={{ background: "var(--panel-2)" }}>
          <div className="text-2xs text-ink-faint uppercase tracking-wider">Sets</div>
          <div className="num text-sm font-bold text-ink mt-0.5">{data.totalSets}</div>
        </div>

        <div className="p-2.5 text-left" style={{ background: "var(--panel-2)" }}>
          <div className="text-2xs text-ink-faint uppercase tracking-wider">Reps</div>
          <div className="num text-sm font-bold text-ink mt-0.5">{data.totalReps}</div>
        </div>
      </div>

      {/* Expanded Muscle Group Distribution */}
      {expanded && (
        <div className="mt-3 pt-2.5 border-t space-y-2" style={{ borderColor: "var(--line-soft)" }}>
          <div className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            Sets by Muscle Group
          </div>
          <div className="space-y-2">
            {Object.entries(data.muscleGroups)
              .sort(([, a], [, b]) => b.sets - a.sets)
              .map(([group, info]) => (
                <div key={group} className="space-y-1">
                  <div className="flex justify-between items-baseline text-2xs">
                    <span className="text-ink font-medium">{group}</span>
                    <span className="num text-ink-dim">
                      {info.sets} sets ({info.percentage}%)
                    </span>
                  </div>
                  <div
                    className="h-1 w-full overflow-hidden rounded-sm"
                    style={{ background: "var(--line-soft)" }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${info.percentage}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
