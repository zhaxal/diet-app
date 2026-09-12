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

  useEffect(() => {
    let cancelled = false;
    api
      .getWorkoutSummary(30)
      .then((res) => {
        if (!cancelled && res.summary) {
          setData(res.summary);
        }
      })
      .catch(() => {});

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
    </div>
  );
}
