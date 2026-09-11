"use client";

import React from "react";
import type {
  FoodEntry,
  Summary,
  Goals,
  Favorite,
  RecentFood,
  WeightLog,
  Trends,
  TrendRange,
} from "@/lib/api-client";
import type { CopiedItem } from "@/lib/copied";
import type { Tab } from "@/components/BottomNav";
import { prettyDate, todayStr, clockTime, weekEnding } from "@/lib/time-client";
import { Panel } from "@/components/Panel";
import { Meter } from "@/components/Meter";
import WeightCard from "@/components/WeightCard";
import AddFood from "@/components/AddFood";
import EntryRow from "@/components/EntryRow";
import TrendsCard from "@/components/TrendsCard";

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

interface Props {
  date: string;
  setDate: (d: string) => void;
  goTab: (t: Tab) => void;
  goals: Goals;
  weightLogs: WeightLog[];
  onWeightLogsChange: (logs: WeightLog[]) => void;
  entries: FoodEntry[];
  summary: Summary | null;
  loadedDate: string | null;
  dayError: string | null;
  staleSince: number | null;
  refreshing: boolean;
  lastLoaded: number | null;
  revalidate: () => Promise<void>;
  loadDay: (d: string) => Promise<void>;
  updateEntry: (entry: FoodEntry) => void;
  removeEntry: (id: string) => Promise<void>;
  copyEntry: (e: FoodEntry) => void;
  copyMeal: (meal: Meal, items: FoodEntry[]) => void;
  clearMeal: (meal: Meal, items: FoodEntry[]) => void;
  stripEnd: string;
  dayTotals: Map<string, { calories: number; count: number }>;
  meal: Meal;
  setMeal: (m: Meal) => void;
  showAdd: boolean;
  setShowAdd: React.Dispatch<React.SetStateAction<boolean>>;
  userId: string;
  favorites: Favorite[];
  recent: RecentFood[];
  copied: CopiedItem[];
  dropCopy: (key: string) => void;
  setFavorites: React.Dispatch<React.SetStateAction<Favorite[]>>;
  trends: Trends | null;
  trendsError: string | null;
  trendRange: TrendRange;
  setTrendRange: (r: TrendRange) => void;
  trendsOpen: boolean;
  toggleTrends: () => void;
  loadTrends: (r: TrendRange) => Promise<void>;
  onOpenShortcuts: () => void;
}

export default function FoodTab({
  date,
  setDate,
  goTab,
  goals,
  weightLogs,
  onWeightLogsChange,
  entries,
  summary,
  loadedDate,
  dayError,
  staleSince,
  refreshing,
  lastLoaded,
  revalidate,
  loadDay,
  updateEntry,
  removeEntry,
  copyEntry,
  copyMeal,
  clearMeal,
  stripEnd,
  dayTotals,
  meal,
  setMeal,
  showAdd,
  setShowAdd,
  userId,
  favorites,
  recent,
  copied,
  dropCopy,
  setFavorites,
  trends,
  trendsError,
  trendRange,
  setTrendRange,
  trendsOpen,
  toggleTrends,
  loadTrends,
  onOpenShortcuts,
}: Props) {
  const total =
    summary?.total ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, count: 0 };
  const calGoal = goals.dailyCalories;
  const calPct = calGoal ? Math.min(100, (total.calories / calGoal) * 100) : 0;
  const calLeft = calGoal ? calGoal - total.calories : 0;
  const calOver = calLeft < 0;

  const isFirstRun =
    entries.length === 0 &&
    !calGoal &&
    !goals.dailyProtein &&
    !goals.dailyCarbs &&
    !goals.dailyFat &&
    favorites.length === 0 &&
    recent.length === 0;

  return (
    <>
      <h1 className="sr-only">{prettyDate(date)}</h1>

      {/* Week strip */}
      <nav className="panel flex overflow-x-auto" aria-label="Week">
        {weekEnding(stripEnd).map((d) => {
          const active = d === date;
          const dt = new Date(`${d}T00:00:00`);
          const day = dayTotals.get(d);
          const known = day != null;
          const logged = (day?.count ?? 0) > 0;
          const pct = calGoal && day ? Math.min(100, (day.calories / calGoal) * 100) : 0;
          const dayOver = calGoal != null && day != null && day.calories > calGoal;

          return (
            <button
              key={d}
              onClick={() => setDate(d)}
              aria-pressed={active}
              aria-label={`${prettyDate(d)}${
                logged && calGoal
                  ? `, ${Math.round(day!.calories)} of ${calGoal} kcal`
                  : logged
                    ? `, ${Math.round(day!.calories)} kcal`
                    : known
                      ? ", nothing logged"
                      : ""
              }`}
              className="flex-1 border-r pt-1.5 text-center last:border-r-0 transition-colors"
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
              {calGoal && known ? (
                <div
                  className="mx-1.5 mb-1.5 mt-1 h-[2px] overflow-hidden"
                  style={{
                    background: active
                      ? "color-mix(in srgb, var(--panel) 25%, transparent)"
                      : "var(--line-soft)",
                  }}
                >
                  <div
                    className="h-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${pct}%`,
                      background: active
                        ? "var(--panel)"
                        : dayOver
                          ? "var(--over)"
                          : "var(--accent)",
                    }}
                  />
                </div>
              ) : (
                <div className="mb-1.5" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Offline reading indicator */}
      {loadedDate === date && staleSince !== null && (
        <div
          className="mt-1.5 flex items-center justify-between gap-2 rounded border px-2 py-1.5"
          style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
          role="status"
        >
          <span className="text-2xs text-ink-dim">
            Offline — showing the reading from{" "}
            <span className="num">{clockTime(staleSince)}</span>. An assistant may have logged since.
          </span>
          <button
            onClick={revalidate}
            disabled={refreshing}
            className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-accent hover:underline disabled:opacity-60"
          >
            {refreshing ? "Trying…" : "Retry"}
          </button>
        </div>
      )}

      {/* Date bar */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="num text-2xs uppercase tracking-wider text-ink-faint">
          {prettyDate(date)}
        </span>
        <div className="flex items-center gap-2">
          {date !== todayStr() && (
            <button
              onClick={() => setDate(todayStr())}
              className="text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
            >
              Today
            </button>
          )}
          <input
            type="date"
            value={date}
            max={todayStr()}
            aria-label="Show a different day"
            onChange={(e) => setDate(e.target.value)}
            className="field num py-1 px-2 text-base sm:text-2xs"
          />
        </div>
      </div>

      {loadedDate !== date ? (
        <section className="panel mt-2 p-4 text-sm text-ink-dim" role="status" aria-live="polite">
          Loading {prettyDate(date).toLowerCase()}…
        </section>
      ) : dayError ? (
        <section className="panel mt-2 p-4" role="alert">
          <p className="text-2xs font-semibold uppercase tracking-wider text-over">
            Could not load this day
          </p>
          <p className="mt-1 text-xs text-ink-faint">{dayError}</p>
          <button
            onClick={() => loadDay(date)}
            className="btn btn-primary mt-3 w-full text-xs"
          >
            Retry
          </button>
        </section>
      ) : (
        <>
          {/* Calorie readout */}
          <section className="panel gridlines mt-2 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xs uppercase tracking-wider text-ink-faint">
                Calories
              </span>
              <button
                onClick={revalidate}
                disabled={refreshing}
                title="Reload this day"
                className="num -m-1.5 p-1.5 text-2xs text-ink-faint transition-colors hover:text-ink disabled:opacity-60"
              >
                {total.count} {total.count === 1 ? "entry" : "entries"}
                {lastLoaded && (
                  <span className="ml-1.5">
                    {refreshing ? "· syncing" : `· ${clockTime(lastLoaded)} ↻`}
                  </span>
                )}
                <span className="sr-only"> — reload this day</span>
              </button>
            </div>

            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-4xl font-bold leading-none text-ink">
                {Math.round(total.calories).toLocaleString()}
              </span>
              {calGoal && (
                <span className="num text-sm text-ink-faint">
                  / {calGoal.toLocaleString()}
                </span>
              )}
              {calGoal ? (
                <span
                  className="num ml-auto text-right text-sm font-semibold shrink-0 whitespace-nowrap"
                  style={{ color: calOver ? "var(--over)" : "var(--ok)" }}
                >
                  {Math.abs(calLeft).toLocaleString()}
                  <span className="ml-1 text-2xs uppercase tracking-wider opacity-80">
                    {calOver ? "over" : "left"}
                  </span>
                </span>
              ) : (
                <button
                  onClick={() => goTab("settings")}
                  className="ml-auto text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
                >
                  Set daily goals →
                </button>
              )}
            </div>

            {calGoal ? (
              <div
                className="mt-2 w-full overflow-hidden rounded-sm"
                style={{ height: 8, background: "var(--line-soft)" }}
              >
                <div
                  className="h-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${calPct}%`,
                    background: calOver ? "var(--over)" : "var(--accent)",
                  }}
                />
              </div>
            ) : (
              <div
                className="mt-2 w-full"
                style={{ height: 1, background: "var(--line)" }}
                aria-hidden="true"
              />
            )}
          </section>

          {/* Secondary macros */}
          <section className="panel mt-2 grid grid-cols-3 gap-2 p-3 min-[480px]:grid-cols-6">
            {[
              { label: "protein", cur: total.protein, goal: goals.dailyProtein, unit: "g" },
              { label: "carbs", cur: total.carbs, goal: goals.dailyCarbs, unit: "g" },
              { label: "fat", cur: total.fat, goal: goals.dailyFat, unit: "g" },
              { label: "fiber", cur: total.fiber, goal: goals.dailyFiber, unit: "g" },
              { label: "sugar", cur: total.sugar, goal: goals.dailySugar, unit: "g" },
              { label: "sodium", cur: total.sodium, goal: goals.dailySodium, unit: "mg" },
            ].map((m) => (
              <Meter
                key={m.label}
                label={m.label}
                value={m.cur}
                goal={m.goal}
                unit={m.unit}
              />
            ))}
            {!calGoal && !goals.dailyProtein && !goals.dailyCarbs && !goals.dailyFat && (
              <div
                className="col-span-full border-t pt-2 text-center"
                style={{ borderColor: "var(--line-soft)" }}
              >
                <button
                  onClick={() => goTab("settings")}
                  className="text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
                >
                  Set daily nutrition goals in Settings →
                </button>
              </div>
            )}
          </section>

          {/* Contextual weight reading and quick logging for this day */}
          <WeightCard
            date={date}
            logs={weightLogs}
            weightUnit={goals.weightUnit || "kg"}
            onLogsChange={onWeightLogsChange}
          />

          {/* Meal selector for new entries */}
          <div
            className="panel mt-2 flex overflow-hidden"
            role="group"
            aria-label="Meal for new entries"
          >
            {MEALS.map((m) => {
              const active = meal === m;
              return (
                <button
                  key={m}
                  onClick={() => setMeal(m)}
                  aria-pressed={active}
                  className="flex-1 border-r py-2 text-2xs font-semibold uppercase tracking-wider transition-colors last:border-r-0"
                  style={{
                    borderColor: "var(--line)",
                    background: active ? "var(--ink)" : "transparent",
                    color: active ? "var(--panel)" : "var(--ink-dim)",
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* Add food composer */}
          <Panel
            title="Add food"
            hint={copied.length > 0 ? `${copied.length} copied` : undefined}
            open={showAdd}
            onToggle={() => setShowAdd((s) => !s)}
          >
            <AddFood
              key={`${userId}:${date}`}
              userId={userId}
              date={date}
              meal={meal}
              onMealChange={setMeal}
              favorites={favorites}
              recent={recent}
              copied={copied}
              onRemoveCopied={dropCopy}
              onLogged={() => loadDay(date)}
              onFavoritesChanged={() => {
                // Triggered in parent via callback
              }}
            />
          </Panel>

          {/* Entries, grouped by meal or onboarding empty state */}
          <section className="mt-2">
            {isFirstRun ? (
              <div className="panel px-4 py-6 text-center space-y-3">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-ink">
                    Welcome to Diet Tracker
                  </h2>
                  <p className="mt-1 text-2xs text-ink-dim max-w-sm mx-auto">
                    Fast, precise daily nutrition logging without bloat or ads. Here is how to get started:
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-left pt-1">
                  <div className="rounded border p-2.5 bg-panel-2 border-line">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-accent block">1. Targets</span>
                    <p className="mt-1 text-2xs text-ink-faint">
                      Set calorie &amp; macro targets in Settings, or calculate via TDEE.
                    </p>
                    <button
                      type="button"
                      onClick={() => goTab("settings")}
                      className="mt-2 text-2xs font-semibold text-accent hover:underline block"
                    >
                      Set Goals →
                    </button>
                  </div>
                  <div className="rounded border p-2.5 bg-panel-2 border-line">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-accent block">2. Log Food</span>
                    <p className="mt-1 text-2xs text-ink-faint">
                      Compose meals with barcode scanning, Open Food Facts, or quick macros.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAdd(true)}
                      className="mt-2 text-2xs font-semibold text-accent hover:underline block"
                    >
                      Add Food (N) →
                    </button>
                  </div>
                  <div className="rounded border p-2.5 bg-panel-2 border-line">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-accent block">3. AI Assistant</span>
                    <p className="mt-1 text-2xs text-ink-faint">
                      Connect Claude, ChatGPT, or Cursor via MCP to log meals hands-free.
                    </p>
                    <button
                      type="button"
                      onClick={() => goTab("settings")}
                      className="mt-2 text-2xs font-semibold text-ink-dim hover:text-ink block"
                    >
                      MCP URL →
                    </button>
                  </div>
                </div>
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={onOpenShortcuts}
                    className="text-2xs text-ink-faint hover:text-ink"
                  >
                    Press <kbd className="num border px-1 rounded bg-panel border-line text-ink">?</kbd> anytime for keyboard shortcuts
                  </button>
                </div>
              </div>
            ) : entries.length === 0 ? (
              <div className="panel px-4 py-8 text-center space-y-3">
                <p className="text-xs text-ink-faint">
                  Nothing logged {date === todayStr() ? "today" : `on ${prettyDate(date)}`}.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdd(true)}
                    className="btn btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs"
                  >
                    + Add Food to {meal}
                  </button>
                </div>
                {favorites.length > 0 && (
                  <div className="pt-3 border-t border-line text-left">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-ink-faint block mb-1.5">
                      Or quick-add a favorite:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {favorites.slice(0, 4).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setShowAdd(true);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded border border-line bg-panel-2 text-2xs hover:border-accent transition-colors"
                        >
                          <span className="font-medium text-ink">{f.name}</span>
                          <span className="num text-ink-faint">{f.calories} kcal</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-2xs text-ink-faint pt-1">
                  Log in seconds here, or tell your AI assistant to log meals via MCP.
                </p>
              </div>
            ) : (
              <>
                {MEALS.map((mealName) => {
                  const items = entries.filter((e) => e.mealType === mealName);
                  if (items.length === 0) return null;
                  return (
                    <div key={mealName} className="panel mb-2 overflow-hidden">
                      <div
                        className="flex items-baseline justify-between border-b px-3 py-1.5"
                        style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
                      >
                        <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                          {mealName}
                        </h3>
                        <div className="flex items-baseline gap-2">
                          <span className="num text-2xs text-ink-faint">
                            {Math.round(summary?.byMeal[mealName]?.calories ?? 0)} kcal
                          </span>
                          <button
                            type="button"
                            onClick={() => copyMeal(mealName, items)}
                            className="text-2xs font-semibold uppercase tracking-wider text-ink-faint transition-colors hover:text-accent"
                          >
                            copy all
                          </button>
                          <button
                            type="button"
                            onClick={() => clearMeal(mealName, items)}
                            className="text-2xs font-semibold uppercase tracking-wider text-ink-faint transition-colors hover:text-over"
                          >
                            clear
                          </button>
                        </div>
                      </div>
                      <ul className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
                        {items.map((entry) => (
                          <EntryRow
                            key={entry.id}
                            entry={entry}
                            onUpdate={updateEntry}
                            onDelete={removeEntry}
                            onCopy={copyEntry}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {MEALS.filter((m) => !entries.some((e) => e.mealType === m)).length > 0 &&
                  MEALS.filter((m) => !entries.some((e) => e.mealType === m)).length < MEALS.length && (
                    <div className="flex items-center justify-between gap-2 px-1 pt-0.5 text-2xs text-ink-faint">
                      <span>Unlogged meals:</span>
                      <div className="flex gap-2">
                        {MEALS.filter((m) => !entries.some((e) => e.mealType === m)).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setMeal(m);
                              setShowAdd(true);
                            }}
                            className="text-2xs font-medium uppercase tracking-wider text-ink-dim hover:text-accent hover:underline"
                          >
                            + {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
              </>
            )}
          </section>

          {/* Trends & Analysis */}
          <Panel
            title="Trends & Analysis"
            hint={
              trends && trends.nutrition.length > 0
                ? `${trendRange === "all" ? "all" : `${trendRange}d`} · avg ${Math.round(trends.nutrition.filter((d) => d.count > 0).reduce((s, d) => s + d.calories, 0) / (trends.nutrition.filter((d) => d.count > 0).length || 1))} kcal`
                : undefined
            }
            open={trendsOpen}
            onToggle={toggleTrends}
            bare
          >
            <div className="pt-2">
              {trends ? (
                <TrendsCard
                  trends={trends}
                  goals={goals}
                  range={trendRange}
                  onRangeChange={(r) => {
                    setTrendRange(r);
                    loadTrends(r).catch(() => {});
                  }}
                  onSetGoals={() => goTab("settings")}
                />
              ) : trendsError ? (
                <section className="panel p-3 text-center">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                    Trends unavailable
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">{trendsError}</p>
                  <button
                    onClick={() => loadTrends(trendRange).catch(() => {})}
                    className="btn btn-primary mt-3 w-full"
                  >
                    Retry
                  </button>
                </section>
              ) : (
                <section className="panel p-3 text-center">
                  <p className="text-2xs uppercase tracking-wider text-ink-faint">
                    Loading trends…
                  </p>
                </section>
              )}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
