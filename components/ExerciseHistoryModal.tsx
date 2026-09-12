"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { TrendingUp, Calendar, Award } from "lucide-react";
import { api } from "@/lib/api-client";
import { LineChart } from "@/components/MiniChart";
import { Dialog } from "@/components/Dialog";

interface ExerciseHistoryModalProps {
  exerciseId: string | null;
  onClose: () => void;
  unit: string;
}

interface HistoryData {
  exercise: {
    id: string;
    name: string;
    normalized: string;
    muscleGroup?: string | null;
  };
  lifetime: {
    bestWeight: number;
    best1RM: number;
    totalVolume: number;
    totalSessions: number;
  };
  sessions: Array<{
    workoutId: string;
    date: string;
    workoutTitle: string;
    topWeight: number;
    top1RM: number;
    volume: number;
    sets: Array<{
      id: string;
      setNumber: number;
      weight: number;
      unit: string;
      reps: number;
      isWarmup: boolean;
      isBodyweight: boolean;
      rpe?: number;
    }>;
  }>;
}

export default function ExerciseHistoryModal({
  exerciseId,
  onClose,
  unit,
}: ExerciseHistoryModalProps) {
  // Retained across a close so the panel still has something to show while
  // it fades out, rather than going blank the instant exerciseId clears.
  const [activeId, setActiveId] = useState(exerciseId);
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [metric, setMetric] = useState<"weight" | "1rm">("weight");

  // Layout effect, not a passive one: this must land in the same commit
  // exerciseId turns non-null, or the dialog opens on a stale/empty id.
  useLayoutEffect(() => {
    if (exerciseId) setActiveId(exerciseId);
  }, [exerciseId]);

  // Fetch exercise history
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getExerciseHistory(activeId)
      .then((res) => {
        if (!cancelled) {
          setData(res as HistoryData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load exercise history", err);
          setError(err instanceof Error ? err.message : "Could not load exercise history");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, loadKey]);

  if (!activeId) return null;

  return (
    <Dialog
      open={exerciseId !== null}
      onClose={onClose}
      title={data ? data.exercise.name : "Exercise Progression"}
      description="Performance record"
      size="md"
      bodyClassName="p-4"
    >
      <div className="space-y-4">
          {loading && (
            <div className="py-12 text-center text-xs text-ink-faint">
              Loading exercise history...
            </div>
          )}

          {!loading && !data && (
            <div className="py-8 text-center text-xs text-ink-faint" role="alert">
              <p>{error ?? "Could not load history for this exercise."}</p>
              <button
                type="button"
                onClick={() => setLoadKey((key) => key + 1)}
                className="btn btn-primary mt-3"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && data && (
            <>
              {/* Lifetime Stats readout */}
              <div className="grid grid-cols-3 gap-2">
                <div
                  className="rounded border p-2.5 text-center"
                  style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
                >
                  <div className="flex items-center justify-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint mb-1">
                    <Award size={12} className="text-accent" aria-hidden="true" />
                    <span>Best Weight</span>
                  </div>
                  <div className="text-base font-bold text-ink">
                    <span className="num">{data.lifetime.bestWeight}</span>
                    <span className="text-2xs font-normal text-ink-faint ml-0.5">{unit}</span>
                  </div>
                </div>

                <div
                  className="rounded border p-2.5 text-center"
                  style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
                >
                  <div className="flex items-center justify-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint mb-1">
                    <TrendingUp size={12} className="text-ink-dim" aria-hidden="true" />
                    <span>Est 1RM</span>
                  </div>
                  <div className="text-base font-bold text-ink">
                    <span className="num">{data.lifetime.best1RM}</span>
                    <span className="text-2xs font-normal text-ink-faint ml-0.5">{unit}</span>
                  </div>
                </div>

                <div
                  className="rounded border p-2.5 text-center"
                  style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
                >
                  <div className="flex items-center justify-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint mb-1">
                    <Calendar size={12} className="text-ink-faint" aria-hidden="true" />
                    <span>Sessions</span>
                  </div>
                  <div className="text-base font-bold text-ink">
                    <span className="num">{data.lifetime.totalSessions}</span>
                  </div>
                </div>
              </div>

              {/* Progression Chart */}
              {data.sessions.length >= 2 && (
                <div
                  className="rounded border p-3"
                  style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                      Progression Curve
                    </span>
                    <div
                      className="flex items-center rounded border p-0.5"
                      style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
                    >
                      <button
                        type="button"
                        onClick={() => setMetric("weight")}
                        className={`min-h-[32px] rounded px-2.5 text-2xs transition-colors ${
                          metric === "weight"
                            ? "bg-ink text-panel font-semibold"
                            : "text-ink-faint hover:text-ink"
                        }`}
                      >
                        Top Weight
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetric("1rm")}
                        className={`min-h-[32px] rounded px-2.5 text-2xs transition-colors ${
                          metric === "1rm"
                            ? "bg-ink text-panel font-semibold"
                            : "text-ink-faint hover:text-ink"
                        }`}
                      >
                        Est 1RM
                      </button>
                    </div>
                  </div>

                  <div className="h-28 w-full">
                    <LineChart
                      data={data.sessions.map((s) => ({
                        value: metric === "weight" ? s.topWeight : s.top1RM,
                      }))}
                      ariaLabel="Exercise progression over time"
                      height={90}
                      color="var(--accent)"
                    />
                  </div>
                </div>
              )}

              {/* Sessions List */}
              <div className="space-y-1.5">
                <span className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                  Session History
                </span>
                <div className="divide-y border rounded" style={{ borderColor: "var(--line)" }}>
                  {[...data.sessions].reverse().map((session) => (
                    <div key={session.workoutId} className="flex flex-col gap-1 p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-ink">
                          <span className="num">{session.date}</span>
                          {session.workoutTitle && (
                            <span className="text-ink-faint font-normal ml-1.5">
                              · {session.workoutTitle}
                            </span>
                          )}
                        </span>
                        <span className="text-2xs text-ink font-semibold">
                          Top: <span className="num">{session.topWeight}</span> {unit}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {session.sets.map((set, idx) => (
                          <span
                            key={idx}
                            className={`rounded px-1.5 py-0.5 text-2xs border ${
                              set.isWarmup
                                ? "text-ink-faint line-through opacity-70"
                                : "text-ink bg-panel-2"
                            }`}
                            style={{ borderColor: "var(--line)" }}
                          >
                            <span className="num">
                              {set.isBodyweight
                                ? set.weight > 0
                                  ? `+${set.weight}${unit} × ${set.reps}`
                                  : set.weight < 0
                                    ? `${set.weight}${unit} × ${set.reps}`
                                    : `BW × ${set.reps}`
                                : `${set.weight}${unit} × ${set.reps}`}
                            </span>
                            {set.rpe ? <span className="num"> @{set.rpe}</span> : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
      </div>
    </Dialog>
  );
}
