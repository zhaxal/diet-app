"use client";

import React from "react";
import { RefreshCw, Search, X } from "lucide-react";
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
import { api } from "@/lib/api-client";
import type { CopiedItem } from "@/lib/copied";
import type { Tab } from "@/components/BottomNav";
import { prettyDate, todayStr, clockTime, consumedAtFor, weekEnding } from "@/lib/time-client";
import { rankRecent } from "@/lib/quick-add-rank";
import { formatQuantity } from "@/lib/units";
import { Panel } from "@/components/Panel";
import { Meter, MeterFill } from "@/components/Meter";
import WeightCard from "@/components/WeightCard";
import AddFood from "@/components/AddFood";
import EntryRow from "@/components/EntryRow";
import TrendsCard from "@/components/TrendsCard";
import Select from "@/components/Select";
import { useToast } from "@/components/Toast";
import { FoodDaySkeleton } from "@/components/DayLoadingSkeleton";
import DayTransition from "@/components/DayTransition";

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

type QuickItem =
  | { kind: "favorite"; food: Favorite }
  | { kind: "recent"; food: RecentFood };

function quickItemDetail(item: QuickItem) {
  if (item.kind === "favorite") return "saved portion";
  return item.food.quantity && item.food.quantityUnit
    ? formatQuantity(item.food.quantity, item.food.quantityUnit)
    : "last portion";
}

function QuickAddRow({
  id,
  label,
  items,
  isPastDay,
  date,
  meal,
  quickLoggingName,
  onRequestQuickLog,
}: {
  id: string;
  label: string;
  items: QuickItem[];
  isPastDay: boolean;
  date: string;
  meal: Meal;
  quickLoggingName: string | null;
  onRequestQuickLog: (item: QuickItem) => void;
}) {
  return (
    <div className="mt-1.5">
      <h3 id={id} className="text-2xs uppercase tracking-wider text-ink-faint">
        {label}
      </h3>
      <div
        className="no-scrollbar scroll-fade-x mt-1 flex gap-2 overflow-x-auto pb-0.5"
        role="group"
        aria-labelledby={id}
        aria-describedby="quick-add-hint"
      >
        {items.map((item) => {
          const { food } = item;
          const isLogging = quickLoggingName === food.name;
          return (
            <button
              key={`${item.kind}:${"id" in food ? food.id : food.name}`}
              type="button"
              onClick={() => onRequestQuickLog(item)}
              disabled={quickLoggingName !== null}
              aria-busy={isLogging || undefined}
              aria-label={
                isPastDay
                  ? `Choose a meal before logging ${food.name}, ${Math.round(food.calories)} calories, on ${prettyDate(date)}`
                  : `Log ${food.name}, ${Math.round(food.calories)} calories, to ${meal}`
              }
              className="motion-press flex min-h-[40px] max-w-64 shrink-0 items-center gap-1.5 rounded border border-line bg-panel-2 px-2.5 py-1.5 text-left transition-colors hover:border-accent disabled:cursor-wait disabled:opacity-60"
            >
              <span className={`min-w-0 truncate text-xs font-medium ${item.kind === "favorite" ? "text-accent" : "text-ink"}`}>
                {isLogging ? "Logging…" : `${item.kind === "favorite" ? "★ " : ""}${food.name}`}
              </span>
              {!isLogging && (
                <span className="num shrink-0 text-2xs text-ink-faint">
                  {Math.round(food.calories)} kcal · {quickItemDetail(item)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  mealConfirmed: boolean;
  setMeal: (m: Meal) => void;
  showAdd: boolean;
  setShowAdd: React.Dispatch<React.SetStateAction<boolean>>;
  userId: string;
  favorites: Favorite[];
  recent: RecentFood[];
  copied: CopiedItem[];
  dropCopy: (key: string) => void;
  onQuickAddDataChanged: () => Promise<void>;
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
  mealConfirmed,
  setMeal,
  showAdd,
  setShowAdd,
  userId,
  favorites,
  recent,
  copied,
  dropCopy,
  onQuickAddDataChanged,
  trends,
  trendsError,
  trendRange,
  setTrendRange,
  trendsOpen,
  toggleTrends,
  loadTrends,
  onOpenShortcuts,
}: Props) {
  const toast = useToast();
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
  const daySurface = loadedDate !== date ? "loading" : dayError ? "error" : "ready";
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);
  const [quickLoggingName, setQuickLoggingName] = React.useState<string | null>(null);
  const quickLoggingRef = React.useRef(false);
  const [quickQuery, setQuickQuery] = React.useState("");
  const [quickSearchSeed, setQuickSearchSeed] = React.useState("");
  const [focusQuickSearch, setFocusQuickSearch] = React.useState(false);
  const [pendingQuickAdd, setPendingQuickAdd] = React.useState<Favorite | RecentFood | null>(null);
  const quickMealChooserRef = React.useRef<HTMLDivElement | null>(null);
  const quickFavorites = React.useMemo<QuickItem[]>(() => {
    return favorites.map((food) => ({ kind: "favorite" as const, food }));
  }, [favorites]);
  const quickRecents = React.useMemo<QuickItem[]>(() => {
    const favoriteNames = new Set(favorites.map((food) => food.name.toLocaleLowerCase()));
    return rankRecent(recent, meal)
      .filter((food) => !favoriteNames.has(food.name.toLocaleLowerCase()))
      .map((food) => ({ kind: "recent" as const, food }));
  }, [favorites, recent, meal]);
  const allQuickItems = React.useMemo(
    () => [...quickFavorites, ...quickRecents],
    [quickFavorites, quickRecents],
  );
  const filteredQuickItems = React.useMemo(() => {
    const query = quickQuery.trim().toLocaleLowerCase();
    return query
      ? allQuickItems.filter(({ food }) => food.name.toLocaleLowerCase().includes(query))
      : [];
  }, [allQuickItems, quickQuery]);
  const isPastDay = date !== todayStr();

  React.useEffect(() => {
    setPendingQuickAdd(null);
    setQuickSearchSeed("");
    setFocusQuickSearch(false);
  }, [date]);

  React.useLayoutEffect(() => {
    if (!pendingQuickAdd) return;
    // The chooser is a required follow-up action. Move focus as part of the
    // committed layout so an unrelated paint/update cannot leave it behind
    // the quick-add trigger.
    const chooser = quickMealChooserRef.current;
    chooser?.scrollIntoView({ block: "nearest" });
    chooser?.querySelector<HTMLButtonElement>('[role="group"] button:not(:disabled)')?.focus({
      preventScroll: true,
    });
  }, [pendingQuickAdd]);

  function refreshFoodLog() {
    void loadDay(date);
    void onQuickAddDataChanged();
  }

  async function quickLog(food: Favorite | RecentFood, targetMeal: Meal = meal) {
    if (quickLoggingRef.current) return;
    quickLoggingRef.current = true;
    setQuickLoggingName(food.name);
    try {
      const isRecent = "lastAt" in food;
      const { entry } = await api.createEntry({
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        sugar: food.sugar,
        sodium: food.sodium,
        mealType: targetMeal,
        productId: isRecent ? food.productId ?? null : null,
        quantity: isRecent ? food.quantity ?? null : null,
        quantityUnit: isRecent ? food.quantityUnit ?? null : null,
        consumedAt: consumedAtFor(date),
      });
      toast(`Added ${food.name} to ${targetMeal}`, "success", {
        label: "Undo",
        onAct: async () => {
          await api.deleteEntry(entry.id);
          refreshFoodLog();
        },
      });
      refreshFoodLog();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not log food", "error");
    } finally {
      quickLoggingRef.current = false;
      setQuickLoggingName(null);
    }
  }

  function requestQuickLog(item: QuickItem) {
    if (isPastDay) {
      setPendingQuickAdd(item.food);
      return;
    }
    void quickLog(item.food);
  }

  async function requestComposerQuickLog(food: Favorite | RecentFood) {
    if (isPastDay) {
      setPendingQuickAdd(food);
      return;
    }
    await quickLog(food);
  }

  function chooseQuickAddMeal(targetMeal: Meal) {
    if (!pendingQuickAdd) return;
    setMeal(targetMeal);
    setPendingQuickAdd(null);
    void quickLog(pendingQuickAdd, targetMeal);
  }

  function openQuickSearch() {
    setQuickSearchSeed(quickQuery);
    setShowAdd(true);
    setFocusQuickSearch(true);
  }

  return (
    <>
      <h1 className="sr-only">Food log for {prettyDate(date)}</h1>

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
              {calGoal && known ? (
                <div
                  className="mx-1.5 mb-1.5 mt-1 h-[2px] overflow-hidden"
                  style={{
                    background: active
                      ? "color-mix(in srgb, var(--panel) 25%, transparent)"
                      : "var(--line-soft)",
                  }}
                >
                  <MeterFill
                    progress={pct}
                    color={active ? "var(--panel)" : dayOver ? "var(--over)" : "var(--accent)"}
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
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
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
            value={date}
            max={todayStr()}
            aria-label="Show a different day"
            onChange={(e) => {
              setDate(e.target.value);
              setDatePickerOpen(false);
            }}
            className="field num hidden py-1 px-2 text-base sm:block sm:text-2xs"
          />
        </div>
        {datePickerOpen && (
          <input
            type="date"
            value={date}
            max={todayStr()}
            aria-label="Show a different day"
            onChange={(e) => {
              setDate(e.target.value);
              setDatePickerOpen(false);
            }}
            className="field num w-full py-1 px-2 text-base sm:hidden"
          />
        )}
      </div>

      <DayTransition transitionKey={`${date}:${daySurface}`}>
      {loadedDate !== date ? (
        <FoodDaySkeleton date={date} />
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
          {/* The day's primary task lands before its report. Meal selection is
              deliberate, but it belongs inside the logging flow rather than
              competing with the dashboard before the user has chosen to log. */}
          <section className="panel mt-2 overflow-hidden" aria-labelledby="log-food-heading">
            <button
              type="button"
              onClick={() => setShowAdd((open) => !open)}
              aria-expanded={showAdd}
              aria-controls="food-composer"
              aria-label={mealConfirmed
                ? `${showAdd ? "Close" : "Open"} food composer for ${meal}`
                : `${showAdd ? "Close" : "Open"} food composer — choose a meal first`}
              className={`motion-press flex min-h-[56px] w-full items-center justify-between gap-3 px-3 text-left transition-colors ${
                showAdd ? "bg-panel-2 text-ink hover:bg-bg" : "bg-ink text-panel hover:opacity-95"
              }`}
            >
              <span className="min-w-0">
                <span id="log-food-heading" className="block text-xs font-semibold uppercase tracking-widest">
                  {showAdd ? "Food composer" : "Log food"}
                </span>
                <span
                  className={`mt-0.5 block text-2xs ${showAdd ? "text-ink-faint" : "text-panel/70"}`}
                >
                  {showAdd
                    ? mealConfirmed ? `Adding to ${meal}` : "Choose a meal before logging"
                    : mealConfirmed
                      ? `${meal} · ${date === todayStr() ? "today" : prettyDate(date)}`
                      : `Choose a meal · ${prettyDate(date)}`}
                </span>
              </span>
              <span className="num text-lg leading-none" aria-hidden="true">
                {showAdd ? "−" : "+"}
              </span>
            </button>

            {allQuickItems.length > 0 && (
              <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <h2 id="quick-add-heading" className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                    Quick add
                  </h2>
                  <span id="quick-add-hint" className="text-2xs text-ink-faint">
                    {isPastDay ? "Choose meal" : "1 tap · Undo"}
                  </span>
                </div>
                <label htmlFor="quick-add-filter" className="mb-1 block text-2xs uppercase tracking-wider text-ink-faint">
                  Find food
                </label>
                <form
                  className="relative"
                  onSubmit={(e) => {
                    e.preventDefault();
                    openQuickSearch();
                  }}
                >
                  <Search
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
                  />
                  <input
                    id="quick-add-filter"
                    value={quickQuery}
                    onChange={(e) => setQuickQuery(e.target.value)}
                    className="field w-full pl-8 pr-10 text-xs"
                    placeholder="Filter favorites and recent foods"
                  />
                  {quickQuery && (
                    <button
                      type="button"
                      onClick={() => setQuickQuery("")}
                      className="glyph-btn absolute right-0 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
                      aria-label="Clear quick add filter"
                    >
                      <X size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  )}
                </form>
                {quickQuery ? (
                  filteredQuickItems.length > 0 ? (
                    <QuickAddRow
                      id="quick-add-matches-heading"
                      label="Matches"
                      items={filteredQuickItems}
                      isPastDay={isPastDay}
                      date={date}
                      meal={meal}
                      quickLoggingName={quickLoggingName}
                      onRequestQuickLog={requestQuickLog}
                    />
                  ) : (
                    <p className="mt-1.5 text-2xs text-ink-faint">No matches in Quick add.</p>
                  )
                ) : (
                  <>
                    {quickFavorites.length > 0 && (
                      <QuickAddRow
                        id="quick-add-favorites-heading"
                        label="Favorites"
                        items={quickFavorites}
                        isPastDay={isPastDay}
                        date={date}
                        meal={meal}
                        quickLoggingName={quickLoggingName}
                        onRequestQuickLog={requestQuickLog}
                      />
                    )}
                    {quickRecents.length > 0 && (
                      <QuickAddRow
                        id="quick-add-recents-heading"
                        label="Recent"
                        items={quickRecents}
                        isPastDay={isPastDay}
                        date={date}
                        meal={meal}
                        quickLoggingName={quickLoggingName}
                        onRequestQuickLog={requestQuickLog}
                      />
                    )}
                  </>
                )}
                {quickQuery && (
                  <button
                    type="button"
                    onClick={openQuickSearch}
                    className="mt-1.5 text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
                  >
                    Search all foods →
                  </button>
                )}
                {pendingQuickAdd && (
                  <div
                    ref={quickMealChooserRef}
                    className="mt-2 border-t pt-2"
                    style={{ borderColor: "var(--line-soft)" }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate text-2xs text-ink-dim">
                        Quick-add <span className="font-semibold text-ink">{pendingQuickAdd.name}</span> to
                      </p>
                      <button
                        type="button"
                        onClick={() => setPendingQuickAdd(null)}
                        className="shrink-0 text-2xs text-ink-faint hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                    <div
                      className="mt-1.5 grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-4"
                      role="group"
                      aria-label={`Choose a meal for ${pendingQuickAdd.name}`}
                    >
                      {MEALS.map((targetMeal) => (
                        <button
                          key={targetMeal}
                          type="button"
                          onClick={() => chooseQuickAddMeal(targetMeal)}
                          disabled={quickLoggingName !== null}
                          className="btn btn-ghost min-h-[36px] px-2 text-2xs capitalize"
                        >
                          {targetMeal}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {showAdd && (
              <div id="food-composer" className="border-t px-3 py-3" style={{ borderColor: "var(--line)" }}>
                <div className="mb-3 flex items-end justify-between gap-3 border-b pb-2" style={{ borderColor: "var(--line-soft)" }}>
                  <div>
                    <p className="text-2xs uppercase tracking-wider text-ink-faint">Logging to</p>
                    <p className="mt-0.5 text-xs font-semibold capitalize text-ink">
                      {mealConfirmed ? meal : "Choose a meal"}
                    </p>
                  </div>
                  <Select
                    value={mealConfirmed ? meal : ""}
                    onChange={(e) => setMeal(e.target.value as Meal)}
                    aria-label="Meal for this food"
                    className="capitalize text-xs"
                    wrapClassName="w-36 shrink-0"
                  >
                    <option value="" disabled>Choose a meal</option>
                    {MEALS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                </div>
                <AddFood
                  key={`${userId}:${date}`}
                  userId={userId}
                  date={date}
                  meal={meal}
                  mealConfirmed={mealConfirmed}
                  onMealChange={setMeal}
                  favorites={favorites}
                  recent={recent}
                  copied={copied}
                  onRemoveCopied={dropCopy}
                  onLogged={refreshFoodLog}
                  onFavoritesChanged={() => { void onQuickAddDataChanged(); }}
                  onQuickLog={requestComposerQuickLog}
                  quickLoggingName={quickLoggingName}
                  seedQuery={quickSearchSeed}
                  onSeedConsumed={() => setQuickSearchSeed("")}
                  focusSearch={focusQuickSearch}
                  onSearchFocusHandled={() => setFocusQuickSearch(false)}
                />
              </div>
            )}
          </section>

          {/* Calorie readout */}
          <section className="panel gridlines mt-2 p-3" aria-labelledby="calories-heading">
            <div className="flex items-baseline justify-between">
              <h2 id="calories-heading" className="text-2xs uppercase tracking-wider text-ink-faint">
                Calories
              </h2>
              <div className="flex min-w-0 items-center gap-0.5">
                <span className="num min-w-0 text-right text-2xs text-ink-faint">
                  {total.count} {total.count === 1 ? "entry" : "entries"}
                  {lastLoaded && (
                    <span className="ml-1.5">
                      {refreshing ? "· syncing" : `· ${clockTime(lastLoaded)}`}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={revalidate}
                  disabled={refreshing}
                  aria-label="Refresh food log"
                  title="Refresh food log"
                  className="glyph-btn -my-2 -mr-2 text-ink-faint transition-colors hover:text-ink disabled:opacity-60"
                >
                  <RefreshCw
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className={refreshing ? "animate-spin" : undefined}
                  />
                </button>
              </div>
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
                  {calOver ? `+${Math.abs(calLeft).toLocaleString()}` : Math.abs(calLeft).toLocaleString()}
                  <span className="ml-1 text-2xs uppercase tracking-wider opacity-80">
                    {calOver ? "over" : "left"}
                  </span>
                </span>
              ) : (
                <button
                  onClick={() => goTab("settings")}
                  className="ml-auto text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
                >
                  Set targets →
                </button>
              )}
            </div>

            {calGoal ? (
              <div
                className="mt-2 w-full overflow-hidden rounded-sm"
                style={{ height: 8, background: "var(--line-soft)" }}
              >
                <MeterFill progress={calPct} over={calOver} />
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
          <section className="panel mt-2 grid grid-cols-3 gap-2 p-3" aria-labelledby="nutrition-heading">
            <h2 id="nutrition-heading" className="sr-only">Nutrition</h2>
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
          </section>

          {/* Entries, grouped by meal or onboarding empty state */}
          <section className="mt-2" aria-labelledby="meals-heading">
            <h2 id="meals-heading" className="sr-only">Meals</h2>
            {isFirstRun ? (
              <div className="panel px-4 py-5 text-center">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-ink">
                    Welcome to Diet Tracker
                  </h3>
                  <p className="mt-1 text-2xs text-ink-dim max-w-sm mx-auto">
                    Start with one food. You can set targets once you have a day to read.
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t pt-3" style={{ borderColor: "var(--line-soft)" }}>
                  <button
                    type="button"
                    onClick={() => goTab("settings")}
                    className="text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
                  >
                    Set optional daily targets →
                  </button>
                  <button
                    type="button"
                    onClick={onOpenShortcuts}
                    className="text-2xs text-ink-faint hover:text-ink"
                  >
                    <kbd className="num border px-1 rounded bg-panel border-line text-ink">?</kbd> shortcuts
                  </button>
                </div>
              </div>
            ) : entries.length === 0 ? (
              <div className="panel px-4 py-6 text-center">
                <p className="text-xs text-ink-faint">
                  Nothing logged {date === todayStr() ? "today" : `on ${prettyDate(date)}`}.
                </p>
                <p className="mt-2 text-2xs text-ink-faint">
                  {allQuickItems.length > 0
                    ? "Quick add is ready above. Open Log food to search or adjust an amount."
                    : "Open Log food to search, scan, or enter an item."}
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
                            onClick={() => {
                              setMeal(mealName);
                              setShowAdd(true);
                            }}
                            className="text-2xs font-semibold uppercase tracking-wider text-ink-faint transition-colors hover:text-accent"
                          >
                            + add
                          </button>
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
                      <span>Add another meal:</span>
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

          {/* Weight remains available, but the day’s actual food record comes first. */}
          <WeightCard
            date={date}
            logs={weightLogs}
            weightUnit={goals.weightUnit || "kg"}
            onLogsChange={onWeightLogsChange}
          />

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
      </DayTransition>
    </>
  );
}
