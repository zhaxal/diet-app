"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  api,
  type FoodEntry,
  type Summary,
  type Totals,
  type Goals,
  type WeightLog,
  type Favorite,
  type RecentFood,
  type Trends,
  type TrendRange,
} from "@/lib/api-client";
import { clockTime, todayStr, shiftDate, prettyDate } from "@/lib/time-client";
import { createLatestRequest } from "@/lib/latest-request";
import { clearFoodDrafts, clearFoodDraftsUnless } from "@/lib/food-draft";
import {
  clearSnapshot,
  clearSnapshotUnless,
  readSnapshot,
  writeSnapshot,
} from "@/lib/offline-cache";
import {
  addManyToTray,
  addToTray,
  clearTray,
  clearTrayUnless,
  readTray,
  removeFromTray,
  type CopiedItem,
} from "@/lib/copied";
import { ToastProvider, useToast } from "@/components/Toast";
import { Meter } from "@/components/Meter";
import BottomNav, { type Tab } from "@/components/BottomNav";
import ThemeToggle from "@/components/ThemeToggle";
import GoalsCard from "@/components/GoalsCard";
import EntryRow from "@/components/EntryRow";
import WeightCard from "@/components/WeightCard";
import TrendsCard from "@/components/TrendsCard";
import AddFood from "@/components/AddFood";
import ProductsCard from "@/components/ProductsCard";
import WorkoutCard from "@/components/WorkoutCard";
import WorkoutNavigator from "@/components/WorkoutNavigator";
import WorkoutSummaryCard from "@/components/WorkoutSummaryCard";
import WorkoutImportModal from "@/components/WorkoutImportModal";
import { UploadCloud } from "lucide-react";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
type Meal = (typeof MEALS)[number];


// The meal a one-tap log lands in follows the clock, not a stale select. Whatever
// this returns is shown on screen before anything is logged, never inferred silently.
function mealForNow(): Meal {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

const MACROS: { key: keyof Omit<Totals, "count">; label: string; goalKey: keyof Goals; unit: string }[] = [
  { key: "protein", label: "Protein", goalKey: "dailyProtein", unit: "g" },
  { key: "carbs", label: "Carbs", goalKey: "dailyCarbs", unit: "g" },
  { key: "fat", label: "Fat", goalKey: "dailyFat", unit: "g" },
  { key: "fiber", label: "Fiber", goalKey: "dailyFiber", unit: "g" },
  { key: "sugar", label: "Sugar", goalKey: "dailySugar", unit: "g" },
  { key: "sodium", label: "Sodium", goalKey: "dailySodium", unit: "mg" },
];

// The seven days ending on `end`, for the header strip.
function weekEnding(end: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(end, i - 6));
}

/**
 * The strip must always contain the day being shown, or the primary navigator
 * stops describing the screen. It ends on today for the usual case, and slides
 * back to end on the selected day once that day falls outside the window.
 */
function stripEnding(selected: string, today: string): string {
  return selected > shiftDate(today, -6) ? today : selected;
}

const TABS: Tab[] = ["food", "workout", "settings"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function Page() {
  return (
    // useSearchParams needs a boundary; the shell renders instantly either way.
    <Suspense fallback={null}>
      <ToastProvider>
        <Dashboard />
      </ToastProvider>
    </Suspense>
  );
}

function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [ready, setReady] = useState(false);

  // Tab and day live in the URL. Android back now walks the tab history instead
  // of exiting the installed app, and the assistant can link to a specific day.
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "workout" || tabParam === "settings" ? tabParam : "food";
  const dParam = params.get("d");
  const date = dParam && DATE_RE.test(dParam) ? dParam : todayStr();

  const writeParams = useCallback(
    (next: { tab?: Tab; d?: string }, mode: "push" | "replace" = "push") => {
      const p = new URLSearchParams(params.toString());
      if (next.tab) p.set("tab", next.tab);
      if (next.d) p.set("d", next.d);
      router[mode](`/?${p.toString()}`, { scroll: false });
    },
    [params, router],
  );
  const goTab = useCallback((t: Tab) => writeParams({ tab: t }), [writeParams]);
  const setDate = useCallback((d: string) => writeParams({ d }), [writeParams]);
  const [workoutRefreshKey, setWorkoutRefreshKey] = useState(0);
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [urlCopied, setUrlCopied] = useState(false);
  const [urlRevealed, setUrlRevealed] = useState(false);
  const [origin, setOrigin] = useState("");
  const [showWorkoutImportModal, setShowWorkoutImportModal] = useState(false);
  const [showMcpDetails, setShowMcpDetails] = useState(false);
  const [showImportExportDetails, setShowImportExportDetails] = useState(false);

  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const loadedDateRef = useRef<string | null>(null);

  const [goals, setGoals] = useState<Goals>({ dailyCalories: null, dailyProtein: null, dailyCarbs: null, dailyFat: null, dailyFiber: null, dailySugar: null, dailySodium: null, weightUnit: "kg", timezone: "UTC", sex: null, birthYear: null, heightCm: null });
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [recent, setRecent] = useState<RecentFood[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<TrendRange>(7);
  const [trendsOpen, setTrendsOpen] = useState(tabParam === "trends");

  // Per-day calorie totals behind the week strip, accumulated from every window
  // that has been read. They used to be lifted out of whatever Trends happened
  // to hold, so the moment you navigated past that window the strip stopped
  // reporting — on exactly the days you had gone back to look at.
  const [dayTotals, setDayTotals] = useState<Map<string, { calories: number; count: number }>>(
    () => new Map(),
  );

  // The copy tray. Device state, not a record - see lib/copied.ts.
  const [copied, setCopied] = useState<CopiedItem[]>([]);
  const [meal, setMeal] = useState<Meal>(mealForNow);
  const [showAdd, setShowAdd] = useState(true);
  const [exporting, setExporting] = useState<"json" | "csv" | null>(null);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);
  const lastLoadedRef = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Set to the moment a displayed reading was taken, whenever what is on screen
  // came from the device rather than the server. Null means the screen is live.
  const [staleSince, setStaleSince] = useState<number | null>(null);
  // Set when a day could not be read at all — distinct from a day that is
  // genuinely empty, which the entries list would otherwise claim it was.
  const [dayError, setDayError] = useState<string | null>(null);
  const todayRef = useRef(todayStr());
  const userIdRef = useRef<string | null>(null);
  // The bootstrap effect runs once and must not re-run when the day changes, so
  // it reads the current day through a ref rather than closing over it.
  const dateRef = useRef(date);
  dateRef.current = date;
  const [dayReads] = useState(() => createLatestRequest(() => dateRef.current));
  useEffect(() => () => dayReads.invalidate(), [dayReads]);

  // Everything a snapshot needs beyond the day itself, held in a ref so that
  // writing one does not change `loadDay`'s identity — which would re-run the
  // day-loading effect every time a favorite changed.
  const auxRef = useRef({ email, goals, favorites, recent, weightLogs });
  useEffect(() => {
    auxRef.current = { email, goals, favorites, recent, weightLogs };
  }, [email, goals, favorites, recent, weightLogs]);
  useEffect(() => {
    lastLoadedRef.current = lastLoaded;
  }, [lastLoaded]);

  const setDaySnapshot = useCallback(
    (d: string, dayEntries: FoodEntry[], sum: Summary | null) => {
      const userId = userIdRef.current;
      // One slot, and it holds today. Letting a glance at last Tuesday overwrite
      // it would mean the next offline launch could not show the current day,
      // which is the only thing the offline launch is for.
      if (!userId || d !== todayStr()) return;
      const aux = auxRef.current;
      writeSnapshot({
        userId,
        email: aux.email,
        date: d,
        at: Date.now(),
        entries: dayEntries,
        summary: sum,
        goals: aux.goals,
        favorites: aux.favorites,
        recent: aux.recent,
        weightLogs: aux.weightLogs,
      });
    },
    [],
  );

  // A day's totals belong to the strip as much as to the readout, so both are
  // written from one place - otherwise logging on a past day moves the figure
  // above and leaves that day's bar reporting the total it had on load.
  const applySummary = useCallback((d: string, sum: Summary | null) => {
    setSummary(sum);
    if (sum) {
      setDayTotals((prev) =>
        new Map(prev).set(d, { calories: sum.total.calories, count: sum.total.count }),
      );
    }
  }, []);

  const loadDay = useCallback(async (d: string) => {
    await dayReads.run(d,
      () => Promise.all([api.listEntries(d), api.summary(d)]),
      ([{ entries: rows }, sum]) => {
        setEntries(rows);
        applySummary(d, sum);
        loadedDateRef.current = d;
        setLoadedDate(d);
        lastLoadedRef.current = Date.now();
        setLastLoaded(lastLoadedRef.current);
        setStaleSince(null);
        setDayError(null);
        setDaySnapshot(d, rows, sum);
      },
      (error) => {
        // A same-day refresh failure preserves the reading and labels it stale.
        if (loadedDateRef.current === d && lastLoadedRef.current !== null) {
          setStaleSince(lastLoadedRef.current);
          return;
        }
        const snap = readSnapshot();
        if (snap && snap.date === d && snap.userId === userIdRef.current) {
          setEntries(snap.entries);
          applySummary(d, snap.summary);
          lastLoadedRef.current = snap.at;
          setLastLoaded(snap.at);
          setStaleSince(snap.at);
          setDayError(null);
        } else {
          setEntries([]);
          setSummary(null);
          lastLoadedRef.current = null;
          setLastLoaded(null);
          setStaleSince(null);
          setDayError(error instanceof Error ? error.message : "Could not load this day");
        }
        loadedDateRef.current = d;
        setLoadedDate(d);
      },
    );
  }, [dayReads, applySummary, setDaySnapshot]);

  const mergeDayTotals = useCallback(
    (rows: { date: string; calories: number; count: number }[]) => {
      setDayTotals((prev) => {
        const next = new Map(prev);
        for (const r of rows) next.set(r.date, { calories: r.calories, count: r.count });
        return next;
      });
    },
    [],
  );

  /** The seven days the strip is currently showing, whenever they change. */
  const loadStrip = useCallback(
    async (end: string) => {
      const { nutrition } = await api.dayTotals(shiftDate(end, -6), end);
      mergeDayTotals(nutrition);
    },
    [mergeDayTotals],
  );

  const loadTrends = useCallback(async (range: TrendRange) => {
    try {
      const t = await api.getTrends(range);
      setTrends(t);
      // Free readings for the strip: the same days, already fetched.
      mergeDayTotals(t.nutrition);
      setTrendsError(null);
    } catch (e) {
      // Swallowing this rendered a heading above nothing, forever. Keep any
      // trends already on screen and say that the refresh failed.
      setTrendsError(e instanceof Error ? e.message : "Could not load trends");
      throw e;
    }
  }, [mergeDayTotals]);

  const toggleTrends = useCallback(() => {
    setTrendsOpen((prev) => {
      const next = !prev;
      if (next && !trends) {
        loadTrends(trendRange).catch(() => {});
      }
      return next;
    });
  }, [trends, trendRange, loadTrends]);

  useEffect(() => {
    (async () => {
      try {
        const [{ user }, { goals: g }, { logs }, { favorites: favs, recent: rec }, { apiKey: key }] =
          await Promise.all([api.me(), api.getGoals(), api.listWeight(), api.listFavorites(), api.getApiKey()]);
        userIdRef.current = user.id;
        // A phone gets handed around. Anything stored for a different account
        // goes before this session can render a byte of it.
        clearSnapshotUnless(user.id);
        clearTrayUnless(user.id);
        clearFoodDraftsUnless(user.id);
        setCopied(readTray(user.id));
        setEmail(user.email);
        setGoals(g);
        setWeightLogs(logs);
        setFavorites(favs);
        setRecent(rec);
        setApiKey(key);
        setOrigin(window.location.origin);
        setReady(true);

        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (browserTz && browserTz !== g.timezone) {
          api.saveGoals({ timezone: browserTz }).then(({ goals: u }) => setGoals(u)).catch(() => {});
        }
      } catch (e) {
        // Only an auth failure means "log in again". A transient network error
        // previously produced a login screen, implying data loss that had not
        // happened — and the login would have failed too.
        const status = (e as { status?: number } | null)?.status;
        if (status === 401 || status === 403) {
          clearSnapshot();
          clearFoodDrafts();
          router.replace("/login");
          return;
        }

        // Offline. The installed app used to stop here at a dead end; show the
        // last reading this device took instead, stamped with when it was taken
        // and never presented as current.
        const snap = readSnapshot();
        if (snap) {
          userIdRef.current = snap.userId;
          clearFoodDraftsUnless(snap.userId);
          setEmail(snap.email);
          setGoals(snap.goals);
          setFavorites(snap.favorites);
          setRecent(snap.recent);
          setWeightLogs(snap.weightLogs ?? []);
          setCopied(readTray(snap.userId));
          // Only if it is the day being asked for. Painting yesterday's figures
          // under today's heading for one frame is exactly the lie this whole
          // path exists to avoid.
          if (snap.date === dateRef.current) {
            setEntries(snap.entries);
            loadedDateRef.current = snap.date;
            setLoadedDate(snap.date);
            applySummary(snap.date, snap.summary);
            setLastLoaded(snap.at);
            setStaleSince(snap.at);
          }
          setOrigin(window.location.origin);
          setReady(true);
        } else {
          setLoadError(e instanceof Error ? e.message : "Could not reach the server");
        }
      }
    })();
  }, [router, applySummary]);

  useEffect(() => {
    if (!ready || tab !== "food") return;
    void loadDay(date);
  }, [ready, tab, date, loadDay]);

  // The strip reads its own window. Seven days is a small query, and it is the
  // only thing that makes the bars true for a day reached by navigating back.
  const stripEnd = stripEnding(date, todayStr());
  useEffect(() => {
    if (ready && tab === "food") loadStrip(stripEnd).catch(() => {});
  }, [ready, tab, stripEnd, loadStrip]);

  useEffect(() => {
    if (ready && (trendsOpen || tabParam === "trends")) {
      loadTrends(trendRange).catch(() => {});
    }
  }, [ready, trendsOpen, tabParam, trendRange, loadTrends]);

  // An installed PWA is not remounted when it comes back from the background, so
  // without this the screen keeps showing whatever it loaded hours ago — including
  // a day that an AI assistant has since written to. Revalidate whenever we become visible,
  // and roll the date forward if we slept through midnight while sitting on today.
  const revalidate = useCallback(async () => {
    setRefreshing(true);
    try {
      if (tab === "food") {
        const now = todayStr();
        const wasOnToday = date === todayRef.current;
        todayRef.current = now;

        if (wasOnToday && date !== now) {
          // Automatic, so replace rather than push — a midnight roll should not
          // become a back-button step.
          writeParams({ d: now }, "replace");
        } else {
          await loadDay(date);
        }

        const [{ favorites: favs, recent: rec }, { goals: g }, { logs }] = await Promise.all([
          api.listFavorites(),
          api.getGoals(),
          api.listWeight(),
        ]);
        setFavorites(favs);
        setRecent(rec);
        setGoals(g);
        setWeightLogs(logs);
        loadStrip(stripEnding(date, todayStr())).catch(() => {});
        if (trendsOpen || trends) {
          loadTrends(trendRange).catch(() => {});
        }
      } else if (tab === "workout") {
        const { goals: g } = await api.getGoals();
        setGoals(g);
      } else {
        const [{ goals: g }, { logs }, { apiKey: key }] = await Promise.all([
          api.getGoals(),
          api.listWeight(),
          api.getApiKey(),
        ]);
        setGoals(g);
        setWeightLogs(logs);
        setApiKey(key);
      }
    } catch {
      // A failed background refresh must not replace the data already on screen.
    } finally {
      setRefreshing(false);
    }
  }, [tab, date, loadDay, loadStrip, loadTrends, trendRange, trendsOpen, trends, writeParams]);

  useEffect(() => {
    if (!ready) return;
    function onWake() {
      if (document.visibilityState === "visible") revalidate();
    }
    function onOnline() {
      revalidate();
    }
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    // The network coming back is the one event that makes a stale screen
    // fixable without the user doing anything.
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onOnline);
    };
  }, [ready, revalidate]);

  /** An entry as the tray stores it, so one row and a whole meal agree. */
  function asCopy(e: FoodEntry) {
    return {
      name: e.name,
      calories: e.calories,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
      fiber: e.fiber,
      sugar: e.sugar,
      sodium: e.sodium,
      mealType: e.mealType,
      productId: e.productId ?? null,
      quantity: e.quantity ?? null,
      quantityUnit: e.quantityUnit ?? null,
      fromDate: date,
    };
  }

  // Copying writes nothing to the log. It opens Add food with the row loaded,
  // where the amount can be changed before anything is recorded — because
  // eating the same thing twice rarely means eating the same amount of it.
  function copyEntry(e: FoodEntry) {
    const userId = userIdRef.current;
    if (!userId) return;
    setCopied(addToTray(userId, asCopy(e)));
    setShowAdd(true);
    toast(`Copied ${e.name} — set the amount in Add food`, "info");
  }

  function copyMeal(m: Meal, items: FoodEntry[]) {
    const userId = userIdRef.current;
    if (!userId || items.length === 0) return;
    // Reversed, so the first row of the meal ends up first in the tray.
    setCopied(addManyToTray(userId, [...items].reverse().map(asCopy)));
    setShowAdd(true);
    toast(`Copied ${items.length} ${m} ${items.length === 1 ? "entry" : "entries"}`, "info");
  }

  function dropCopy(key: string) {
    const userId = userIdRef.current;
    if (!userId) return;
    setCopied(removeFromTray(userId, key));
  }

  async function removeEntry(id: string) {
    const doomed = entries.find((e) => e.id === id);
    try {
      await api.deleteEntry(id);
      await loadDay(date);
      toast(
        `Deleted ${doomed?.name ?? "entry"}`,
        "info",
        doomed
          ? {
              label: "Undo",
              onAct: () => {
                // Re-created rather than restored; the row returns with a new id.
                return api
                  .createEntry({
                    name: doomed.name,
                    calories: doomed.calories,
                    protein: doomed.protein,
                    carbs: doomed.carbs,
                    fat: doomed.fat,
                    fiber: doomed.fiber,
                    sugar: doomed.sugar,
                    sodium: doomed.sodium,
                    mealType: doomed.mealType,
                    consumedAt: doomed.consumedAt,
                    productId: doomed.productId,
                    quantity: doomed.quantity,
                    quantityUnit: doomed.quantityUnit,
                  })
                  .then(() => loadDay(date));
              },
            }
          : undefined,
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete entry", "error");
    }
  }

  function updateEntry(updated: FoodEntry) {
    if (date !== dateRef.current) return;
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    // Use the same guarded read as navigation, including the offline snapshot.
    void loadDay(date);
    api.listFavorites().then(({ favorites: favs, recent: rec }) => {
      setFavorites(favs);
      setRecent(rec);
    }).catch(() => {});
  }

  const mcpUrl = apiKey ? `${origin}/api/mcp?key=${apiKey}` : "";
  const displayedMcpUrl = urlRevealed && mcpUrl
    ? mcpUrl
    : mcpUrl
      ? `${origin}/api/mcp?key=••••••••`
      : "…";

  // `<a download>` gave no signal of any kind when it failed — and it can fail
  // for several reasons that look identical from the outside: an expired
  // session, an installed PWA that will not start a download from a standalone
  // window, or a server error. Fetching it means a failure has a message.
  async function downloadExport(format: "json" | "csv") {
    setExporting(format);
    try {
      const res = await fetch(`/api/export?format=${format}`, { credentials: "same-origin" });
      if (!res.ok) {
        throw new Error(
          res.status === 401 ? "Your session expired — sign in again" : `Export failed (${res.status})`,
        );
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("The server returned an empty file");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diet-export-${todayStr()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick; revoking synchronously races the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Exported ${(blob.size / 1024).toFixed(1)} kB`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExporting(null);
    }
  }

  async function copyUrl() {
    // `navigator.clipboard` is undefined on a plain-HTTP origin, which is exactly
    // how this app gets self-hosted on a LAN. Unguarded, Copy did nothing at all
    // and said nothing about it; the URL is selectable in the field either way.
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(mcpUrl);
      setUrlCopied(true);
      toast("Connector URL copied");
      setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      setUrlRevealed(true);
      toast("Could not copy — select the URL above and copy it manually", "error");
    }
  }

  async function regenerateKey() {
    if (!confirm("Regenerate key? The old connector URL will stop working immediately.")) return;
    try {
      const { apiKey: newKey } = await api.regenerateApiKey();
      setApiKey(newKey);
      toast("New key generated", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not regenerate the key", "error");
    }
  }

  async function logout() {
    // Before the request, so a failed logout still leaves nothing readable on
    // the device.
    clearSnapshot();
    clearTray();
    clearFoodDrafts();
    try {
      await api.logout();
    } catch {
      // The cookie may already be gone, or the network may be down. Either way
      // the user asked to leave, so leave — /login re-checks the session.
    }
    router.replace("/login");
  }

  if (!ready) {
    return (
      <main className="flex min-h-safe items-center justify-center p-3">
        {loadError ? (
          <div className="panel w-full max-w-sm p-3 text-center">
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
              Cannot reach the server
            </p>
            <p className="mt-1 text-xs text-ink-faint">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary mt-3 w-full"
            >
              Retry
            </button>
          </div>
        ) : (
          <span className="num text-xs uppercase tracking-widest text-ink-faint">
            Loading
          </span>
        )}
      </main>
    );
  }

  const total: Totals =
    summary?.total ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, count: 0 };
  const calGoal = goals.dailyCalories;
  const calPct = calGoal ? Math.min(100, (total.calories / calGoal) * 100) : 0;
  const calLeft = calGoal ? calGoal - total.calories : 0;
  const calOver = calLeft < 0;

  return (
    <div className="mx-auto max-w-2xl px-3 pb-32 pt-3">
      {/* ── Food ──────────────────────────────────────── */}
      {tab === "food" && (
        <>
          {/* The other three tabs render a visible <h1>. Here the screen is the
              instrument itself; a visible title would repeat the strip and the
              date beneath it, but the document still needs a top-level heading. */}
          <h1 className="sr-only">{prettyDate(date)}</h1>
          {/* Week strip. Each cell reports that day's calorie total against the
              goal, so the strip is an instrument rather than a date picker. It is
              a report, not a score: no streak, no praise, no colour beyond the two
              the system already uses for in-range and over. */}
          <nav className="panel flex overflow-x-auto" aria-label="Week">
            {weekEnding(stripEnd).map((d) => {
              const active = d === date;
              const dt = new Date(`${d}T00:00:00`);
              const day = dayTotals.get(d);
              // Outside the loaded trend window we have no reading for the day.
              // "Nothing logged" would be a claim we cannot make.
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
                  {/* Only drawn once a goal exists — an empty rail on seven cells
                      would read as "you have eaten nothing" rather than "unset". */}
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

          {/* The one thing an offline screen must never do is look current. The
              calorie readout's clock already says when the reading was taken;
              this says why it has not moved since. */}
          {loadedDate === date && staleSince !== null && (
            <div
              className="mt-1.5 flex items-center justify-between gap-2 rounded border px-2 py-1.5"
              style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
              role="status"
            >
              <span className="text-2xs text-ink-dim">
                Offline — showing the reading from{" "}
                <span className="num">{clockTime(staleSince)}</span>. An assistant may
                have logged since.
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

          <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="num text-2xs uppercase tracking-wider text-ink-faint">
                {prettyDate(date)}
              </span>
              <div className="flex items-center gap-2">
                {/* Once the strip slides back to an older week there is no cell
                    for today to return to. */}
                {date !== todayStr() && <button
                  onClick={() => setDate(todayStr())}
                  className="text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
                >
                  Today
                </button>}
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
              <p className="text-sm font-semibold">This day could not be read</p>
              <p className="mt-1 text-xs text-ink-dim">{dayError}</p>
              <button onClick={() => void loadDay(date)} className="btn btn-primary mt-3">Retry</button>
            </section>
          ) : <>
          {/* Calorie readout */}
          <section className="panel gridlines mt-2 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xs uppercase tracking-wider text-ink-faint">
                Calories
              </span>
              {/* Says when this reading was taken, and reloads on tap. Without it
                  there is no way to tell a current day from an hours-old one. */}
              {/* No aria-label: one would override the visible text, and the
                  entry count and sync time are exactly what the control exists
                  to report. The purpose goes in the title/description instead. */}
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
                  Set a goal →
                </button>
              )}
            </div>

            {/* Same rule as the week strip and the meters: no goal, no rail. */}
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

          {/* Macro meters */}
          <section className="panel mt-2 grid grid-cols-2 gap-x-4 gap-y-3 p-3 min-[400px]:grid-cols-3">
            {MACROS.map((m) => (
              <Meter
                key={m.key}
                label={m.label}
                value={total[m.key]}
                goal={goals[m.goalKey] as number | null}
                unit={m.unit}
              />
            ))}
          </section>

          {/* Contextual weight reading and quick logging for this day */}
          <WeightCard
            date={date}
            logs={weightLogs}
            weightUnit={goals.weightUnit}
            onLogsChange={(fresh) => {
              setWeightLogs(fresh);
              if (trends) loadTrends(trendRange).catch(() => {});
            }}
          />

          {/* Where the next log lands. Every capture path on this screen reads it,
              so it is stated before anything is tapped rather than inferred after. */}
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

          {/* Add food — the one place an entry is composed, whether it comes
              from the copy tray, favorites, a saved label, something eaten before, Open
              Food Facts, or nothing but the numbers on a wrapper. */}
          <Panel
            title="Add food"
            hint={copied.length > 0 ? `${copied.length} copied` : undefined}
            open={showAdd}
            onToggle={() => setShowAdd((s) => !s)}
          >
            <AddFood
              key={`${userIdRef.current}:${date}`}
              userId={userIdRef.current!}
              date={date}
              meal={meal}
              onMealChange={setMeal}
              favorites={favorites}
              recent={recent}
              copied={copied}
              onRemoveCopied={dropCopy}
              onLogged={() => loadDay(date)}
              onFavoritesChanged={() =>
                api.listFavorites().then(({ favorites: favs }) => setFavorites(favs)).catch(() => {})
              }
            />
          </Panel>

          {/* Entries, grouped by meal */}
          <section className="mt-2">
            {entries.length === 0 ? (
              // Names only the routes this account actually has. The old copy
              // pointed a day-one user at a favorite and a saved product that
              // did not exist.
              <div className="panel px-3 py-8 text-center">
                <p className="text-xs text-ink-faint">
                  Nothing logged {date === todayStr() ? "today" : `on ${prettyDate(date)}`}.
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-2xs">
                  <button
                    onClick={() => setShowAdd(true)}
                    className="font-semibold uppercase tracking-wider text-accent hover:underline"
                  >
                    Add food →
                  </button>
                  {favorites.length === 0 && (
                    <button
                      onClick={() => goTab("settings")}
                      className="text-ink-faint hover:text-ink"
                    >
                      or let an AI assistant log it for you
                    </button>
                  )}
                </div>
              </div>
            ) : (
              MEALS.map((meal) => {
                const items = entries.filter((e) => e.mealType === meal);
                if (items.length === 0) return null;
                return (
                  <div key={meal} className="panel mb-2 overflow-hidden">
                    <div
                      className="flex items-baseline justify-between border-b px-3 py-1.5"
                      style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
                    >
                      <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                        {meal}
                      </h3>
                      <div className="flex items-baseline gap-2">
                        <span className="num text-2xs text-ink-faint">
                          {Math.round(summary?.byMeal[meal]?.calories ?? 0)} kcal
                        </span>
                        {/* The bulk case the day-copy panel used to serve, in one
                            tap and without a second surface: a whole meal onto the
                            tray, where each row keeps its own amount. */}
                        <button
                          onClick={() => copyMeal(meal, items)}
                          className="text-2xs font-semibold uppercase tracking-wider text-ink-faint transition-colors hover:text-accent"
                        >
                          copy all
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
              })
            )}
          </section>

          {/* Trends & Analysis — collapsible instrument */}
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
          </>}
        </>
      )}

      {/* ── Workout ───────────────────────────────────── */}
      {tab === "workout" && (
        <>
          <WorkoutNavigator
            currentDate={date}
            onSelectDate={setDate}
            todayDate={todayStr()}
            refreshTrigger={workoutRefreshKey}
          />

          <WorkoutCard
            date={date}
            weightUnit={goals.weightUnit || "kg"}
            onToast={(m) => toast(m)}
            onWorkoutSaved={() => setWorkoutRefreshKey((k) => k + 1)}
          />

          <div className="mt-3">
            <WorkoutSummaryCard
              weightUnit={goals.weightUnit || "kg"}
              refreshTrigger={workoutRefreshKey}
            />
          </div>
        </>
      )}

      {/* ── Settings ──────────────────────────────────── */}
      {tab === "settings" && (
        <>
          <Header sub={email}>Settings</Header>

          <div className="panel mb-2 flex items-center justify-between px-3 py-2">
            <span className="text-2xs uppercase tracking-wider text-ink-dim">Appearance</span>
            <ThemeToggle />
          </div>

          <GoalsCard
            goals={goals}
            latestWeight={weightLogs.length ? weightLogs[weightLogs.length - 1].weight : null}
            onGoalsChange={setGoals}
          />

          {/* The assistant is a front door, not a footnote: this used to be the
              last section on the screen, below Export. It sits above the archival
              controls now, and below Goals, which is where "Set a goal" lands. */}
          {/* AI Assistant / MCP connector */}
          <section className="panel mt-2 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                AI Assistant / MCP connector
              </h2>
              <button
                type="button"
                onClick={() => setShowMcpDetails((s) => !s)}
                className="text-2xs text-ink-faint hover:text-ink transition-colors flex items-center gap-1"
                aria-expanded={showMcpDetails}
              >
                <span>{showMcpDetails ? "Hide details" : "Details"}</span>
                <span className="num text-xs">{showMcpDetails ? "−" : "+"}</span>
              </button>
            </div>

            {showMcpDetails && (
              <div
                className="mt-2 space-y-1.5 border-b pb-2.5 text-2xs text-ink-faint"
                style={{ borderColor: "var(--line-soft)" }}
              >
                <p>
                  Connect any MCP client (Claude, Cursor, Windsurf, ChatGPT) to auto-log meals from labels, photos, or barcodes.
                </p>
                <p className="text-over">
                  Anyone with this URL can read and change your diet data.
                </p>
                <div>
                  Includes <strong className="text-ink-dim">13 tools</strong> (barcode lookup, nutrition OCR, auto-saving) &amp; <strong className="text-ink-dim">5 live resources</strong> (@today/summary, @today/entries, @catalog/products).
                </div>
              </div>
            )}

            <div className="mt-2.5 flex items-center gap-1.5">
              <code
                className="num min-w-0 flex-1 truncate rounded px-2 py-1.5 text-2xs text-ink-dim"
                style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
              >
                {displayedMcpUrl}
              </code>
              <button
                onClick={() => setUrlRevealed((shown) => !shown)}
                disabled={!mcpUrl}
                className="btn btn-ghost shrink-0"
              >
                {urlRevealed ? "Hide" : "Reveal"}
              </button>
              <button onClick={copyUrl} disabled={!mcpUrl} className="btn btn-primary shrink-0">
                {urlCopied ? "✓" : "Copy"}
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between text-2xs">
              <span className="text-ink-faint">
                Timezone <span className="num text-ink-dim">{goals.timezone}</span>
              </span>
              <button onClick={regenerateKey} className="text-ink-faint hover:text-over">
                Regenerate key
              </button>
            </div>
          </section>

          <Panel title="Product catalog" hint="labels you can log by amount" defaultOpen={false}>
            <ProductsCard />
          </Panel>

          <section className="panel mt-2 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                Import & Export
              </h2>
              <button
                type="button"
                onClick={() => setShowImportExportDetails((s) => !s)}
                className="text-2xs text-ink-faint hover:text-ink transition-colors flex items-center gap-1"
                aria-expanded={showImportExportDetails}
              >
                <span>{showImportExportDetails ? "Hide details" : "Details"}</span>
                <span className="num text-xs">{showImportExportDetails ? "−" : "+"}</span>
              </button>
            </div>

            {showImportExportDetails && (
              <div
                className="mt-2 space-y-1 border-b pb-2.5 text-2xs text-ink-faint"
                style={{ borderColor: "var(--line-soft)" }}
              >
                <p>
                  <strong className="text-ink-dim">JSON:</strong> Complete backup (food, weight, products, workouts).
                </p>
                <p>
                  <strong className="text-ink-dim">CSV:</strong> Tabular food log entries for spreadsheets.
                </p>
                <p>
                  <strong className="text-ink-dim">Vault (.md):</strong> Workout logs formatted for Obsidian.
                </p>
                <p>
                  <strong className="text-ink-dim">Import:</strong> Markdown logs from Obsidian, Hevy, or Strong. Dry-run preview supported.
                </p>
              </div>
            )}

            {/* Export */}
            <div className="mt-2.5">
              <span className="text-2xs text-ink-faint block uppercase tracking-wider mb-1.5">
                Export Data
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => downloadExport("json")}
                  disabled={exporting !== null}
                  className="btn btn-ghost text-center text-2xs"
                >
                  {exporting === "json" ? "Preparing…" : "JSON Backup"}
                </button>
                <button
                  onClick={() => downloadExport("csv")}
                  disabled={exporting !== null}
                  className="btn btn-ghost text-center text-2xs"
                >
                  {exporting === "csv" ? "Preparing…" : "CSV Entries"}
                </button>
                <a
                  href="/api/workouts/export?format=markdown"
                  download={`workouts-vault-${date}.md`}
                  className="btn btn-ghost text-center text-2xs flex items-center justify-center"
                >
                  Vault (.md)
                </a>
              </div>
            </div>

            {/* Import */}
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--line)" }}>
              <span className="text-2xs text-ink-faint block uppercase tracking-wider mb-1.5">
                Import Data
              </span>
              <button
                type="button"
                onClick={() => setShowWorkoutImportModal(true)}
                className="btn btn-ghost w-full text-center text-2xs flex items-center justify-center gap-1.5"
              >
                <UploadCloud size={13} aria-hidden="true" />
                <span>Import Workouts (Markdown)</span>
              </button>
            </div>
          </section>

          <div className="mt-3 flex items-center justify-between">
            {/* --accent on bare --bg measures 4.32:1; every other accent in the
                app sits on a panel at 5.02:1+. --ink-dim clears it here. */}
            <Link href="/api-docs" className="text-2xs text-ink-dim underline hover:text-ink">API docs ↗</Link>
            <button onClick={logout} className="btn btn-ghost">Log out</button>
          </div>
        </>
      )}

      {showWorkoutImportModal && (
        <WorkoutImportModal
          weightUnit={goals.weightUnit || "kg"}
          onClose={() => setShowWorkoutImportModal(false)}
          onSuccess={(count) => {
            toast(`Successfully imported ${count} workout${count === 1 ? "" : "s"}`);
            setShowWorkoutImportModal(false);
            setWorkoutRefreshKey((k) => k + 1);
          }}
        />
      )}

      <BottomNav active={tab} onChange={goTab} />
    </div>
  );
}

function Header({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h1 className="text-sm font-semibold uppercase tracking-widest text-ink">{children}</h1>
      {sub && <span className="num text-2xs text-ink-faint">{sub}</span>}
    </div>
  );
}

// Collapsible bordered section. Controlled when `open`/`onToggle` are supplied.
function Panel({
  title, hint, children, open, onToggle, defaultOpen = false, bare = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
  bare?: boolean;
}) {
  const [selfOpen, setSelfOpen] = useState(defaultOpen);
  const isOpen = open ?? selfOpen;
  const toggle = onToggle ?? (() => setSelfOpen((s) => !s));
  const bodyId = `panel-${useId()}`;

  return (
    <section className="panel mt-2">
      <button
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
          {title}
        </span>
        <span className="flex items-center gap-2">
          {hint && <span className="text-2xs text-ink-faint">{hint}</span>}
          <span className="num text-xs text-ink-faint">{isOpen ? "−" : "+"}</span>
        </span>
      </button>
      {isOpen && (
        <div id={bodyId} className={bare ? "" : "border-t px-3 py-2.5"} style={bare ? undefined : { borderColor: "var(--line)" }}>
          {children}
        </div>
      )}
    </section>
  );
}

function NumInput({ value, onChange, label, required }: { value: string; onChange: (v: string) => void; label: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-2xs uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <input
        type="number"
        min={0}
        step="any"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field num mt-0.5 w-full text-right"
      />
    </label>
  );
}
