"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { prettyDate, shiftDate } from "@/lib/time-client";
import { workoutSessionCache } from "./WorkoutCard";

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

// 7 days ending on end
function weekEnding(end: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(end, i - 6));
}

// Ensure strip contains selected date
function stripEnding(selected: string, today: string): string {
  return selected > shiftDate(today, -6) ? today : selected;
}

export default function WorkoutNavigator({
  currentDate,
  onSelectDate,
  todayDate,
  refreshTrigger = 0,
}: WorkoutNavigatorProps) {
  const [sessions, setSessions] = useState<WorkoutSessionItem[]>([]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getWorkoutDates()
      .then((res) => {
        if (!cancelled && res.sessions) {
          setSessions(res.sessions);
          for (const s of res.sessions) {
            if (!workoutSessionCache.has(s.date)) {
              api
                .getWorkout(s.date)
                .then((wRes) => {
                  if (wRes.workout) {
                    workoutSessionCache.set(s.date, {
                      workout: wRes.workout,
                      title: wRes.workout.title,
                      rawNote: wRes.workout.rawNote,
                      exerciseStats: wRes.exerciseStats || {},
                      saveStatus: "saved",
                    });
                  }
                })
                .catch(() => {});
            }
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [refreshTrigger]);

  const isToday = currentDate === todayDate;
  const stripEnd = stripEnding(currentDate, todayDate);
  const weekDays = weekEnding(stripEnd);

  return (
    <nav aria-label="Workout session navigation" className="mb-2">
      {/* 7-Day Week Strip matching Today tab */}
      <div className="panel flex overflow-x-auto" aria-label="Workout week">
        {weekDays.map((d) => {
          const active = d === currentDate;
          const dt = new Date(`${d}T00:00:00`);
          const session = sessions.find((s) => s.date === d);
          const hasWorkout = Boolean(session);

          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelectDate(d)}
              aria-pressed={active}
              aria-label={`${prettyDate(d)}${
                session ? `, ${session.title} (${session.setsCount} sets)` : ", no workout"
              }`}
              className="motion-segment flex-1 border-r pt-1.5 text-center last:border-r-0 transition-colors"
              style={{
                borderColor: "var(--line)",
                background: active ? "var(--ink)" : "transparent",
                color: active ? "var(--panel)" : "var(--ink-dim)",
              }}
            >
              <div className="text-2xs uppercase tracking-wider opacity-70">
                {dt.toLocaleDateString(undefined, { weekday: "narrow" })}
              </div>
              <div className="num text-sm font-semibold">{d.slice(8)}</div>

              {/* 2px accent indicator bar for training days */}
              <div
                className="mx-1.5 mb-1.5 mt-1 h-[2px] overflow-hidden"
                style={{
                  background: active
                    ? "color-mix(in srgb, var(--panel) 25%, transparent)"
                    : "var(--line-soft)",
                }}
              >
                {hasWorkout ? (
                  <div
                    className="h-full w-full"
                    style={{
                      background: active ? "var(--panel)" : "var(--accent)",
                    }}
                  />
                ) : (
                  <div className="h-full w-full bg-transparent" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Date Bar: Identical layout and rhythm to Food tab */}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="num text-2xs uppercase tracking-wider text-ink-faint">
          {prettyDate(currentDate)}
        </span>

        <div className="flex items-center gap-2">
          {!isToday && (
            <button
              type="button"
              onClick={() => {
                onSelectDate(todayDate);
                setDatePickerOpen(false);
              }}
              className="text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => setDatePickerOpen((open) => !open)}
            aria-expanded={datePickerOpen}
            className="text-2xs font-semibold uppercase tracking-wider text-ink-dim hover:text-accent sm:hidden"
          >
            {datePickerOpen ? "Close date" : "Change date"}
          </button>
          <input
            type="date"
            value={currentDate}
            max={todayDate}
            aria-label="Show a different day"
            onChange={(e) => {
              if (e.target.value) {
                onSelectDate(e.target.value);
                setDatePickerOpen(false);
              }
            }}
            className="field num hidden py-1 px-2 text-base sm:block sm:text-2xs"
          />
        </div>
        {datePickerOpen && (
          <input
            type="date"
            value={currentDate}
            max={todayDate}
            aria-label="Show a different day"
            onChange={(e) => {
              if (e.target.value) {
                onSelectDate(e.target.value);
                setDatePickerOpen(false);
              }
            }}
            className="field num w-full py-1 px-2 text-base sm:hidden"
          />
        )}
      </div>
    </nav>
  );
}
