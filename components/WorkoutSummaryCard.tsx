"use client";

import { useEffect, useState } from "react";
import { Dumbbell, Flame, Layers, ChevronDown, ChevronUp } from "lucide-react";
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Dumbbell size={14} className="text-accent" aria-hidden="true" />
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            30-Day Training Summary
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="min-h-[36px] px-2 flex items-center gap-1 text-2xs text-ink-faint hover:text-ink transition-colors"
          aria-expanded={expanded}
        >
          <span>{expanded ? "Less" : "Breakdown"}</span>
          {expanded ? (
            <ChevronUp size={12} aria-hidden="true" />
          ) : (
            <ChevronDown size={12} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Primary Metrics Row */}
      <div className="grid grid-cols-3 gap-2 mt-2 text-center">
        <div
          className="rounded border p-2"
          style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
        >
          <div className="text-2xs text-ink-faint uppercase tracking-wider mb-0.5">Sessions</div>
          <div className="num text-sm font-bold text-ink">{data.totalWorkouts}</div>
        </div>

        <div
          className="rounded border p-2"
          style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
        >
          <div className="text-2xs text-ink-faint uppercase tracking-wider mb-0.5">Volume</div>
          <div className="num text-sm font-bold text-ink">
            {data.totalVolume.toLocaleString()}
            <span className="text-2xs font-normal text-ink-faint ml-0.5">{weightUnit}</span>
          </div>
        </div>

        <div
          className="rounded border p-2"
          style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
        >
          <div className="text-2xs text-ink-faint uppercase tracking-wider mb-0.5">Sets</div>
          <div className="num text-sm font-bold text-ink">{data.totalSets}</div>
        </div>
      </div>

      {/* Expanded Muscle Group Distribution */}
      {expanded && (
        <div className="mt-3 pt-2.5 border-t space-y-2" style={{ borderColor: "var(--line-soft)" }}>
          <div className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            Sets by Muscle Group
          </div>
          <div className="space-y-1.5">
            {Object.entries(data.muscleGroups)
              .sort(([, a], [, b]) => b.sets - a.sets)
              .map(([group, info]) => (
                <div key={group} className="space-y-0.5">
                  <div className="flex justify-between text-2xs">
                    <span className="text-ink font-medium">{group}</span>
                    <span className="num text-ink-dim">
                      {info.sets} sets ({info.percentage}%)
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-sm"
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
