"use client";

import { useState } from "react";
import { type Goals, type Meal, type Trends } from "@/lib/api-client";
import { BarChart, LineChart } from "./MiniChart";
import { Meter } from "./Meter";

interface Props {
  trends: Trends;
  goals: Goals;
  onDaysChange: (days: 7 | 30) => void;
  /** Route to the goals form; the range view is unreadable without targets. */
  onSetGoals: () => void;
}

const METRICS = ["calories", "protein", "weight"] as const;
type Metric = (typeof METRICS)[number];

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

type NutrientKey = "protein" | "carbs" | "fat" | "fiber" | "sugar" | "sodium";

const AVERAGE_ROWS: { key: NutrientKey; label: string; goalKey: keyof Goals; unit: string }[] = [
  { key: "protein", label: "Protein", goalKey: "dailyProtein", unit: "g" },
  { key: "carbs", label: "Carbs", goalKey: "dailyCarbs", unit: "g" },
  { key: "fat", label: "Fat", goalKey: "dailyFat", unit: "g" },
  { key: "fiber", label: "Fiber", goalKey: "dailyFiber", unit: "g" },
  { key: "sugar", label: "Sugar", goalKey: "dailySugar", unit: "g" },
  { key: "sodium", label: "Sodium", goalKey: "dailySodium", unit: "mg" },
];

// One segmented control, matching the meal selector on Today.
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  grow,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  grow?: boolean;
}) {
  return (
    <div
      className={`${grow ? "flex" : "inline-flex"} overflow-hidden rounded border`}
      style={{ borderColor: "var(--line)" }}
      role="group"
      aria-label={label}
    >
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={String(o)}
            onClick={() => onChange(o)}
            aria-pressed={active}
            className={`${grow ? "flex-1" : ""} border-r px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider transition-colors last:border-r-0`}
            style={{
              borderColor: "var(--line)",
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--panel)" : "var(--ink-dim)",
            }}
          >
            {typeof o === "number" ? `${o}d` : o}
          </button>
        );
      })}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="num truncate text-sm font-semibold" style={{ color: tone ?? "var(--ink)" }}>
        {value}
      </div>
      <div className="truncate text-2xs uppercase tracking-wider text-ink-faint">{label}</div>
    </div>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export default function TrendsCard({ trends, goals, onDaysChange, onSetGoals }: Props) {
  const [metric, setMetric] = useState<Metric>("calories");

  // Averages are over days that were actually logged. An unlogged day is missing
  // data, not a zero, and averaging it in would understate every figure here.
  const logged = trends.nutrition.filter((d) => d.count > 0);
  const avg = (key: "calories" | NutrientKey) =>
    logged.length === 0 ? 0 : logged.reduce((s, d) => s + d[key], 0) / logged.length;

  const calGoal = goals.dailyCalories;
  const weightSeries = trends.weight.map((d) => d.value);
  const weightDelta =
    weightSeries.length >= 2 ? weightSeries[weightSeries.length - 1] - weightSeries[0] : null;

  const header = (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-2xs uppercase tracking-wider text-ink-faint">
        Last {trends.days} days
      </span>
      <Segmented
        options={[7, 30] as const}
        value={trends.days as 7 | 30}
        onChange={onDaysChange}
        label="Range"
      />
    </div>
  );

  // Charts of nothing are worse than no charts: flat zero bars and six zeroed
  // meters read as a measurement rather than an absence.
  if (logged.length === 0) {
    return (
      <section className="panel p-3">
        {header}
        <p className="mt-3 text-sm text-ink-dim">Nothing logged in this window.</p>
        <p className="mt-1 text-xs text-ink-faint">
          Averages, goal adherence and the meal split all appear once a day has entries.
        </p>
      </section>
    );
  }

  // The selected metric's own series and statistics.
  const series =
    metric === "weight"
      ? weightSeries
      : logged.map((d) => (metric === "calories" ? d.calories : d.protein));
  const unit = metric === "calories" ? "kcal" : metric === "protein" ? "g" : goals.weightUnit;
  const chartData = trends.nutrition.map((d) => ({
    label: d.date.slice(5),
    value: metric === "calories" ? d.calories : d.protein,
  }));

  // Every day in the window is exactly one of three things.
  const inRange = calGoal ? logged.filter((d) => d.calories <= calGoal).length : 0;
  const over = calGoal ? logged.length - inRange : 0;
  const unlogged = trends.nutrition.length - logged.length;

  const mealTotal = MEALS.reduce((s, m) => s + (trends.meals?.[m]?.calories ?? 0), 0);

  return (
    <div className="space-y-2">
      {/* Coverage. The caption this replaces claimed averages "over 30 days"
          while quietly computing them over however many were logged. */}
      <section className="panel p-3">
        {header}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label="days logged" value={`${logged.length}/${trends.nutrition.length}`} />
          <Stat label="avg kcal" value={Math.round(avg("calories")).toLocaleString()} />
          <Stat
            label={`weight ${goals.weightUnit}`}
            value={
              weightDelta === null ? "—" : `${weightDelta > 0 ? "+" : ""}${round1(weightDelta)}`
            }
          />
        </div>
      </section>

      <section className="panel p-3">
        <Segmented options={METRICS} value={metric} onChange={setMetric} label="Metric" grow />

        <div className="mt-2 h-28 overflow-hidden">
          {metric === "weight" ? (
            weightSeries.length >= 2 ? (
              <LineChart
                data={trends.weight.map((d) => ({ value: d.value }))}
                color="var(--accent)"
              />
            ) : (
              <p className="pt-10 text-center text-xs text-ink-faint">
                Log at least 2 weight entries to see the trend
              </p>
            )
          ) : (
            <BarChart
              data={chartData}
              color="var(--accent)"
              // Only calories carries a goal to read the bars against. Without
              // one the chart is a shape rather than a measurement.
              reference={metric === "calories" ? calGoal : null}
            />
          )}
        </div>

        {series.length > 0 && (
          <div
            className="mt-2 grid grid-cols-3 gap-2 border-t pt-2"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <Stat label={`min ${unit}`} value={String(round1(Math.min(...series)))} />
            <Stat label={`median ${unit}`} value={String(round1(median(series)))} />
            <Stat label={`max ${unit}`} value={String(round1(Math.max(...series)))} />
          </div>
        )}
        {metric === "calories" && calGoal != null && (
          <p className="mt-1.5 text-2xs text-ink-faint">
            The dashed rule is your <span className="num">{calGoal.toLocaleString()}</span> kcal
            goal; bars past it turn red.
          </p>
        )}
      </section>

      <section className="panel p-3">
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
          Against goal
        </h2>
        {calGoal != null ? (
          <>
            {/* One cell per day, in the same three-state vocabulary as the week
                strip: in range, over, or never logged — which is not zero. */}
            <div
              className="mt-2 flex gap-px"
              role="img"
              aria-label={`${inRange} days in range, ${over} over, ${unlogged} never logged`}
            >
              {trends.nutrition.map((d) => {
                const state = d.count === 0 ? "unlogged" : d.calories <= calGoal ? "in" : "over";
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${
                      state === "unlogged"
                        ? "nothing logged"
                        : `${Math.round(d.calories)} of ${calGoal} kcal`
                    }`}
                    className="h-7 flex-1"
                    style={{
                      background:
                        state === "in"
                          ? "var(--accent)"
                          : state === "over"
                            ? "var(--over)"
                            : "var(--line-soft)",
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Stat label="in range" value={String(inRange)} tone="var(--accent)" />
              <Stat label="over" value={String(over)} tone={over > 0 ? "var(--over)" : undefined} />
              <Stat label="never logged" value={String(unlogged)} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-xs text-ink-faint">
              No calorie goal set, so there is nothing to measure these days against.
            </p>
            <button
              onClick={onSetGoals}
              className="mt-2 text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
            >
              Set a goal →
            </button>
          </>
        )}
      </section>

      {/* The same six meters as Today, over the window instead of the day. */}
      <section className="panel p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
            Average day
          </h2>
          <span className="num text-2xs text-ink-faint">
            {logged.length} logged {logged.length === 1 ? "day" : "days"}
          </span>
        </div>
        <div className="mt-2">
          <Meter label="Calories" value={avg("calories")} goal={calGoal} unit="kcal" size="lg" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3">
          {AVERAGE_ROWS.map((m) => (
            <Meter
              key={m.key}
              label={m.label}
              value={avg(m.key)}
              goal={goals[m.goalKey] as number | null}
              unit={m.unit}
            />
          ))}
        </div>
      </section>

      <section className="panel p-3">
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">By meal</h2>
        {mealTotal > 0 ? (
          <ul className="mt-2 space-y-2">
            {MEALS.map((m) => {
              const bucket = trends.meals?.[m] ?? { calories: 0, count: 0 };
              const share = (bucket.calories / mealTotal) * 100;
              return (
                <li key={m}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-2xs uppercase tracking-wider text-ink-faint">{m}</span>
                    <span className="num text-2xs text-ink-dim">
                      <span className="font-semibold text-ink">
                        {Math.round(bucket.calories / logged.length)}
                      </span>
                      <span className="text-ink-faint"> kcal/day</span>
                      <span className="ml-2">{Math.round(share)}%</span>
                    </span>
                  </div>
                  <div
                    className="mt-1 w-full overflow-hidden rounded-sm"
                    style={{ height: 4, background: "var(--line-soft)" }}
                  >
                    <div
                      className="h-full transition-[width] duration-500 ease-out"
                      style={{ width: `${share}%`, background: "var(--accent)" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-ink-faint">No meals in this window.</p>
        )}
      </section>
    </div>
  );
}
