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
import BottomNav, { type Tab } from "@/components/BottomNav";
import FoodTab, { type Meal } from "@/components/FoodTab";
import SettingsTab from "@/components/SettingsTab";
import ShortcutsModal from "@/components/ShortcutsModal";
import WorkoutCard from "@/components/WorkoutCard";
import WorkoutNavigator from "@/components/WorkoutNavigator";
import WorkoutSummaryCard from "@/components/WorkoutSummaryCard";
import WorkoutImportModal from "@/components/WorkoutImportModal";

// The meal a one-tap log lands in follows the clock, not a stale select. Whatever
// this returns is shown on screen before anything is logged, never inferred silently.
function mealForNow(): Meal {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

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
  const [showAdd, setShowAdd] = useState(false);
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

  async function clearMeal(m: Meal, items: FoodEntry[]) {
    if (items.length === 0) return;
    const doomed = [...items];
    try {
      for (const item of doomed) {
        await api.deleteEntry(item.id);
      }
      await loadDay(date);
      toast(
        `Cleared ${m} (${doomed.length} ${doomed.length === 1 ? "entry" : "entries"})`,
        "info",
        {
          label: "Undo",
          onAct: async () => {
            for (const item of doomed) {
              await api.createEntry({
                name: item.name,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                fiber: item.fiber,
                sugar: item.sugar,
                sodium: item.sodium,
                mealType: item.mealType,
                consumedAt: item.consumedAt,
                productId: item.productId,
                quantity: item.quantity,
                quantityUnit: item.quantityUnit,
              });
            }
            await loadDay(date);
          },
        },
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not clear meal", "error");
    }
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setDate(shiftDate(date, -1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (date < todayStr()) {
          setDate(shiftDate(date, 1));
        }
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setDate(todayStr());
      } else if (e.key === "n" || e.key === "N" || e.key === "/") {
        e.preventDefault();
        if (tab !== "food") {
          goTab("food");
        }
        setShowAdd((prev) => !prev);
      } else if (e.key === "1") {
        e.preventDefault();
        goTab("food");
      } else if (e.key === "2") {
        e.preventDefault();
        goTab("workout");
      } else if (e.key === "3") {
        e.preventDefault();
        goTab("settings");
      } else if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((s) => !s);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [date, tab, setDate, goTab]);

  async function regenerateKey() {
    setConfirmingRegenerate(false);
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

  return (
    <div className="mx-auto max-w-2xl px-3 pb-32 pt-3">
      {tab === "food" && (
        <FoodTab
          date={date}
          setDate={setDate}
          goTab={goTab}
          goals={goals}
          weightLogs={weightLogs}
          onWeightLogsChange={setWeightLogs}
          entries={entries}
          summary={summary}
          loadedDate={loadedDate}
          dayError={dayError}
          staleSince={staleSince}
          refreshing={refreshing}
          lastLoaded={lastLoaded}
          revalidate={revalidate}
          loadDay={loadDay}
          updateEntry={updateEntry}
          removeEntry={removeEntry}
          copyEntry={copyEntry}
          copyMeal={copyMeal}
          clearMeal={clearMeal}
          stripEnd={stripEnd}
          dayTotals={dayTotals}
          meal={meal}
          setMeal={setMeal}
          showAdd={showAdd}
          setShowAdd={setShowAdd}
          userId={userIdRef.current || ""}
          favorites={favorites}
          recent={recent}
          copied={copied}
          dropCopy={dropCopy}
          setFavorites={setFavorites}
          trends={trends}
          trendsError={trendsError}
          trendRange={trendRange}
          setTrendRange={setTrendRange}
          trendsOpen={trendsOpen}
          toggleTrends={toggleTrends}
          loadTrends={loadTrends}
          onOpenShortcuts={() => setShowShortcuts(true)}
        />
      )}

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

      {tab === "settings" && (
        <SettingsTab
          email={email}
          goals={goals}
          setGoals={setGoals}
          latestWeight={weightLogs.length ? weightLogs[weightLogs.length - 1].weight : null}
          mcpUrl={mcpUrl}
          displayedMcpUrl={displayedMcpUrl}
          urlRevealed={urlRevealed}
          setUrlRevealed={setUrlRevealed}
          copyUrl={copyUrl}
          urlCopied={urlCopied}
          regenerateKey={regenerateKey}
          confirmingRegenerate={confirmingRegenerate}
          setConfirmingRegenerate={setConfirmingRegenerate}
          exporting={exporting}
          downloadExport={downloadExport}
          date={date}
          onOpenWorkoutImport={() => setShowWorkoutImportModal(true)}
          onOpenShortcuts={() => setShowShortcuts(true)}
          logout={logout}
        />
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

      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      <BottomNav active={tab} onChange={goTab} />
    </div>
  );
}
