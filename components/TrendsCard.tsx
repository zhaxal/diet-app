"use client";

import { useEffect, useRef, useState } from "react";
import { type Goals, type Meal, type TrendDay, type TrendRange, type Trends } from "@/lib/api-client";
import { BarChart, LineChart } from "./MiniChart";
import { Meter } from "./Meter";

interface Props {
  trends: Trends;
  goals: Goals;
  range: TrendRange;
  onRangeChange: (range: TrendRange) => void;
  /** Route to the goals form; the range view is unreadable without targets. */
  onSetGoals: () => void;
}

const METRICS = ["calories", "protein", "weight"] as const;
type Metric = (typeof METRICS)[number];

const RANGES: readonly TrendRange[] = [7, 30, 90, "all"];

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
  format,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  grow?: boolean;
  format?: (v: T) => string;
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
            {format ? format(o) : typeof o === "number" ? `${o}d` : o}
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

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

type Grain = "day" | "week" | "month";

/**
 * How finely the chart can be drawn before a bar stops being a bar. A phone
 * gives the chart roughly 340px, so a year of daily bars is under a pixel each —
 * a texture, not a measurement. Coarser buckets past those thresholds.
 */
function grainFor(days: number): Grain {
  if (days <= 92) return "day";
  if (days <= 400) return "week";
  return "month";
}

interface Bucket {
  /** The first day in the bucket, which is also its axis label. */
  start: string;
  /** Average over the bucket's *logged* days, so a goal line still reads. */
  value: number;
  logged: number;
}

/**
 * Buckets carry the average of their logged days, never the sum. A weekly sum
 * cannot be read against a daily goal, and the reference line in this chart is
 * a daily goal.
 */
function bucketize(days: TrendDay[], grain: Grain, key: "calories" | "protein"): Bucket[] {
  if (grain === "day") {
    return days.map((d) => ({ start: d.date, value: d[key], logged: d.count > 0 ? 1 : 0 }));
  }
  const out: Bucket[] = [];
  let current: { start: string; sum: number; logged: number } | null = null;
  const keyOf = (date: string, i: number) =>
    grain === "month" ? date.slice(0, 7) : String(Math.floor(i / 7));
  let currentKey: string | null = null;

  days.forEach((d, i) => {
    const k = keyOf(d.date, i);
    if (k !== currentKey) {
      if (current) out.push({ start: current.start, value: current.logged ? current.sum / current.logged : 0, logged: current.logged });
      current = { start: d.date, sum: 0, logged: 0 };
      currentKey = k;
    }
    if (d.count > 0) {
      current!.sum += d[key];
      current!.logged += 1;
    }
  });
  if (current) {
    const c = current as { start: string; sum: number; logged: number };
    out.push({ start: c.start, value: c.logged ? c.sum / c.logged : 0, logged: c.logged });
  }
  return out;
}

/** Monday-first weekday index, so the adherence grid reads as a calendar. */
function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

export default function TrendsCard({ trends, goals, range, onRangeChange, onSetGoals }: Props) {
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
      <span className="min-w-0 truncate text-2xs uppercase tracking-wider text-ink-faint">
        {range === "all" ? (
          <>
            All <span className="num">{trends.days}</span> days ·{" "}
            <span className="num normal-case tracking-normal">
              from {shortDate(trends.from)}
            </span>
          </>
        ) : (
          <>
            Last <span className="num">{trends.days}</span> days
          </>
        )}
      </span>
      <Segmented
        options={RANGES}
        value={range}
        onChange={onRangeChange}
        label="Range"
        format={(r) => (r === "all" ? "all" : `${r}d`)}
      />
    </div>
  );

  // Charts of nothing are worse than no charts: flat zero bars and six zeroed
  // meters read as a measurement rather than an absence.
  if (logged.length === 0) {
    return (
      <section className="panel p-3">
        {header}
        <p className="mt-3 text-sm text-ink-dim">
          {range === "all" ? "Nothing logged yet." : "Nothing logged in this window."}
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          Averages, goal adherence and the meal split all appear once a day has entries.
        </p>
      </section>
    );
  }

  const grain = grainFor(trends.nutrition.length);
  const grainNote =
    grain === "day" ? null : grain === "week" ? "one bar per week" : "one bar per month";

  // The selected metric's own series and statistics. The stats stay per-day
  // whatever the bars are grouped into — a median of weekly averages is a
  // different number, and not the one the label claims.
  const series =
    metric === "weight"
      ? weightSeries
      : logged.map((d) => (metric === "calories" ? d.calories : d.protein));
  const unit = metric === "calories" ? "kcal" : metric === "protein" ? "g" : goals.weightUnit;
  const buckets =
    metric === "weight" ? [] : bucketize(trends.nutrition, grain, metric === "calories" ? "calories" : "protein");
  const chartData = buckets.map((b) => ({ label: b.start, value: b.value }));
  const hasTrend = series.length >= 2;
  const trendLabel =
    metric === "weight"
      ? `Weight trend across ${series.length} readings, from ${shortDate(trends.weight[0]?.date ?? trends.from)} to ${shortDate(trends.weight[trends.weight.length - 1]?.date ?? trends.to)}`
      : `${metric === "calories" ? "Calories" : "Protein"} trend across ${logged.length} logged days, from ${shortDate(trends.from)} to ${shortDate(trends.to)}`;

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
                ariaLabel={trendLabel}
                color="var(--accent)"
              />
            ) : (
              <p className="pt-10 text-center text-xs text-ink-faint">
                Log at least 2 weight entries to see the trend
              </p>
            )
          ) : hasTrend ? (
            <BarChart
              data={chartData}
              ariaLabel={trendLabel}
              color="var(--accent)"
              // Only calories carries a goal to read the bars against. Without
              // one the chart is a shape rather than a measurement.
              reference={metric === "calories" ? calGoal : null}
            />
          ) : (
            <p className="pt-10 text-center text-xs text-ink-faint">
              Log food on one more day to see the trend
            </p>
          )}
        </div>

        {/* Two ticks are an axis. Without them a hundred bars have no anchor in
            time at all, which is the failure a long range introduces. The bars
            span the whole window; the line spans only the days that have a
            reading, so each names its own ends. */}
        {hasTrend && (
          <div className="mt-1 flex justify-between text-2xs text-ink-faint">
            <span className="num">
              {shortDate(metric === "weight" ? trends.weight[0].date : trends.from)}
            </span>
            <span className="num">
              {shortDate(
                metric === "weight" ? trends.weight[trends.weight.length - 1].date : trends.to,
              )}
            </span>
          </div>
        )}

        {hasTrend && (
          <div
            className="mt-2 grid grid-cols-3 gap-2 border-t pt-2"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <Stat label={`min ${unit}`} value={String(round1(Math.min(...series)))} />
            <Stat label={`median ${unit}`} value={String(round1(median(series)))} />
            <Stat label={`max ${unit}`} value={String(round1(Math.max(...series)))} />
          </div>
        )}
        <p className="mt-1.5 text-2xs text-ink-faint">
          {metric === "weight" ? (
            "Every reading in the window, oldest first."
          ) : (
            <>
              {grainNote ? (
                <>
                  {grainNote[0].toUpperCase() + grainNote.slice(1)}, averaged over the days that
                  were logged.{" "}
                </>
              ) : null}
              {metric === "calories" && calGoal != null ? (
                <>
                  The dashed rule is your <span className="num">{calGoal.toLocaleString()}</span>{" "}
                  kcal goal; bars past it turn red.
                </>
              ) : null}
              {/* Min/median/max are always per day, whatever the bars group into. */}
              {grainNote ? " Min, median and max below are per day." : null}
            </>
          )}
        </p>
      </section>

      <section className="panel p-3">
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
          Against goal
        </h2>
        {calGoal != null ? (
          <>
            <Adherence days={trends.nutrition} goal={calGoal} />
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

/**
 * One cell per day, in the same three-state vocabulary as the week strip: in
 * range, over, or never logged — which is not zero.
 *
 * A single row works until a row of 365 cells is a third of a pixel each. Past
 * a month the cells fold into weekday rows and columns of weeks, which is a
 * calendar rather than a bar, and keeps every day its own readable cell.
 */
function Adherence({ days, goal }: { days: TrendDay[]; goal: number }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const folded = days.length > 31;

  // The most recent week is the one worth seeing first.
  useEffect(() => {
    if (folded && scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [folded, days.length]);

  const state = (d: TrendDay) => (d.count === 0 ? "unlogged" : d.calories <= goal ? "in" : "over");
  const fill = (s: string) =>
    s === "in" ? "var(--accent)" : s === "over" ? "var(--over)" : "var(--line-soft)";
  const title = (d: TrendDay) =>
    `${d.date}: ${
      d.count === 0 ? "nothing logged" : `${Math.round(d.calories)} of ${goal} kcal`
    }`;

  const inRange = days.filter((d) => d.count > 0 && d.calories <= goal).length;
  const over = days.filter((d) => d.count > 0 && d.calories > goal).length;
  const label = `${inRange} days in range, ${over} over, ${days.length - inRange - over} never logged`;

  if (!folded) {
    return (
      <div className="mt-2 flex gap-px" role="img" aria-label={label}>
        {days.map((d) => (
          <div
            key={d.date}
            title={title(d)}
            className="h-7 flex-1"
            style={{ background: fill(state(d)) }}
          />
        ))}
      </div>
    );
  }

  // Blank cells before the first day, so every column is a real calendar week.
  const lead = weekdayIndex(days[0].date);

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        <div
          className="grid shrink-0 gap-px"
          style={{ gridTemplateRows: "repeat(7, 8px)" }}
        >
          {WEEKDAY_INITIALS.map((w, i) => (
            <span
              key={i}
              className="flex h-2 items-center leading-none text-ink-faint"
              style={{ fontSize: 8 }}
              aria-hidden="true"
            >
              {i % 2 === 0 ? w : ""}
            </span>
          ))}
        </div>
        <div ref={scroller} className="no-scrollbar overflow-x-auto" role="img" aria-label={label}>
          <div
            className="grid gap-px"
            style={{
              gridTemplateRows: "repeat(7, 8px)",
              gridAutoFlow: "column",
              gridAutoColumns: "8px",
            }}
          >
            {Array.from({ length: lead }, (_, i) => (
              <div key={`pad${i}`} className="h-2 w-2" />
            ))}
            {days.map((d) => (
              <div
                key={d.date}
                title={title(d)}
                className="h-2 w-2"
                style={{ background: fill(state(d)) }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-2xs text-ink-faint">
        {[
          { c: "var(--accent)", t: "in range" },
          { c: "var(--over)", t: "over" },
          { c: "var(--line-soft)", t: "never logged" },
        ].map((k) => (
          <span key={k.t} className="flex items-center gap-1">
            <span className="h-2 w-2" style={{ background: k.c }} aria-hidden="true" />
            {k.t}
          </span>
        ))}
      </div>
    </div>
  );
}
