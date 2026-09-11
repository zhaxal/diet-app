"use client";

import { useEffect, useState, useRef } from "react";
import { X, TrendingUp, Calendar, Award } from "lucide-react";
import { api } from "@/lib/api-client";
import { LineChart } from "@/components/MiniChart";

interface ExerciseHistoryModalProps {
  exerciseId: string;
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
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<"weight" | "1rm">("weight");
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Fetch exercise history
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getExerciseHistory(exerciseId)
      .then((res) => {
        if (!cancelled) {
          setData(res as HistoryData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load exercise history", err);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "color-mix(in srgb, var(--ink) 65%, transparent)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-modal-title"
        className="relative flex flex-col w-full max-w-lg max-h-[92dvh] sm:max-h-[85vh] overflow-hidden rounded-t sm:rounded border"
        style={{
          background: "var(--panel)",
          borderColor: "var(--line)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-3.5 py-2.5 sm:px-4 sm:py-3"
          style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
        >
          <div>
            <h2 id="exercise-modal-title" className="text-sm font-semibold tracking-wide text-ink">
              {data ? data.exercise.name : "Exercise Progression"}
            </h2>
            <p className="text-2xs text-ink-faint uppercase tracking-wider">Performance Record</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-ink-faint hover:text-ink transition-colors"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="py-12 text-center text-xs text-ink-faint">
              Loading exercise history...
            </div>
          )}

          {!loading && !data && (
            <div className="py-8 text-center text-xs text-ink-faint">
              Could not load history for this exercise.
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
      </div>
    </div>
  );
}
