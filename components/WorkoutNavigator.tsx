"use client";

import { useEffect, useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar, Plus, Dumbbell } from "lucide-react";
import { api } from "@/lib/api-client";
import { prettyDate } from "@/lib/time-client";

interface WorkoutSessionItem {
  id: string;
  date: string;
  title: string;
  setsCount: number;
  volume: number;
}

interface WorkoutNavigatorProps {
  currentDate: string;
  onSelectDate: (date: string) => void;
  todayDate: string;
  refreshTrigger?: number;
}

export default function WorkoutNavigator({
  currentDate,
  onSelectDate,
  todayDate,
  refreshTrigger = 0,
}: WorkoutNavigatorProps) {
  const [sessions, setSessions] = useState<WorkoutSessionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getWorkoutDates()
      .then((res) => {
        if (!cancelled && res.sessions) {
          setSessions(res.sessions);
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

  // Unique sorted dates with workouts (newest first)
  const sessionDates = useMemo(() => {
    return Array.from(new Set(sessions.map((s) => s.date))).sort((a, b) =>
      b.localeCompare(a),
    );
  }, [sessions]);

  // Find previous session (chronologically earlier than currentDate)
  const prevSessionDate = useMemo(() => {
    const older = sessionDates.filter((d) => d < currentDate);
    return older.length > 0 ? older[0] : null;
  }, [sessionDates, currentDate]);

  // Find next session (chronologically later than currentDate)
  const nextSessionDate = useMemo(() => {
    const newer = sessionDates.filter((d) => d > currentDate);
    return newer.length > 0 ? newer[newer.length - 1] : null;
  }, [sessionDates, currentDate]);

  const activeSession = sessions.find((s) => s.date === currentDate);
  const isToday = currentDate === todayDate;

  return (
    <nav aria-label="Workout session navigation" className="space-y-2 mb-3">
      {/* Top Stepper Bar: Prev Session | Current Date & Title | Next Session */}
      <div
        className="panel flex items-center justify-between p-2 text-xs"
        style={{ background: "var(--panel)" }}
      >
        <button
          type="button"
          onClick={() => prevSessionDate && onSelectDate(prevSessionDate)}
          disabled={!prevSessionDate}
          className="min-h-[36px] flex items-center gap-1 px-2.5 py-1 rounded text-ink-dim hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors"
          style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
          aria-label={prevSessionDate ? `Jump to previous workout on ${prevSessionDate}` : "No earlier workout"}
        >
          <ChevronLeft size={14} aria-hidden="true" />
          <span className="text-2xs font-semibold uppercase tracking-wider hidden sm:inline">
            Prev
          </span>
        </button>

        {/* Center: Date, Title, and Picker */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-center min-w-0">
            <div className="flex items-center justify-center gap-1.5">
              <span className="num text-xs font-bold text-ink truncate">
                {currentDate}
              </span>
              {isToday && (
                <span
                  className="text-2xs font-semibold uppercase tracking-wider px-1 rounded shrink-0"
                  style={{
                    color: "var(--accent)",
                    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                  }}
                >
                  Today
                </span>
              )}
            </div>
            <div className="text-2xs text-ink-faint truncate max-w-[160px] sm:max-w-[220px]">
              {activeSession ? activeSession.title : "No session logged"}
            </div>
          </div>

          <label
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded text-ink-dim hover:text-ink cursor-pointer transition-colors relative"
            title="Pick a specific date"
          >
            <span className="sr-only">Pick date</span>
            <Calendar size={14} aria-hidden="true" />
            <input
              type="date"
              value={currentDate}
              max={todayDate}
              onChange={(e) => e.target.value && onSelectDate(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>

        {/* Right Stepper: Next Session or Today */}
        <div className="flex items-center gap-1">
          {!isToday && (
            <button
              type="button"
              onClick={() => onSelectDate(todayDate)}
              className="min-h-[36px] px-2 rounded text-2xs font-semibold uppercase tracking-wider text-accent hover:underline hidden sm:inline-block"
            >
              Today
            </button>
          )}

          <button
            type="button"
            onClick={() => nextSessionDate && onSelectDate(nextSessionDate)}
            disabled={!nextSessionDate}
            className="min-h-[36px] flex items-center gap-1 px-2.5 py-1 rounded text-ink-dim hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors"
            style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
            aria-label={nextSessionDate ? `Jump to next workout on ${nextSessionDate}` : "No newer workout"}
          >
            <span className="text-2xs font-semibold uppercase tracking-wider hidden sm:inline">
              Next
            </span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Recent Sessions Quick Rail */}
      <div
        aria-label="Recent workout sessions"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-2xs"
      >
        {/* Shortcut to Log Today */}
        <button
          type="button"
          onClick={() => onSelectDate(todayDate)}
          className={`min-h-[30px] flex items-center gap-1 px-2.5 py-1 rounded border shrink-0 transition-colors ${
            isToday
              ? "bg-ink text-panel font-semibold border-ink"
              : "text-ink-dim hover:text-ink"
          }`}
          style={
            !isToday
              ? { background: "var(--panel-2)", borderColor: "var(--line)" }
              : undefined
          }
        >
          <Plus size={11} aria-hidden="true" />
          <span>Today</span>
        </button>

        {/* Past logged workouts list */}
        {sessions.slice(0, 8).map((session) => {
          const isSelected = session.date === currentDate;
          const dt = new Date(`${session.date}T00:00:00`);
          const monthDay = dt.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });

          return (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelectDate(session.date)}
              aria-pressed={isSelected}
              className={`min-h-[30px] flex items-center gap-1.5 px-2.5 py-1 rounded border shrink-0 transition-colors ${
                isSelected
                  ? "bg-ink text-panel font-semibold border-ink"
                  : "text-ink-dim hover:text-ink"
              }`}
              style={
                !isSelected
                  ? { background: "var(--panel-2)", borderColor: "var(--line)" }
                  : undefined
              }
            >
              <Dumbbell size={10} className={isSelected ? "text-panel" : "text-ink-faint"} aria-hidden="true" />
              <span className="num font-medium">{monthDay}</span>
              <span className="truncate max-w-[90px] opacity-80">
                {session.title}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
