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
  type MealTemplate,
  type FoodMacros,
} from "@/lib/api-client";
import { clockTime, consumedAtFor, todayStr } from "@/lib/time-client";
import {
  clearSnapshot,
  clearSnapshotUnless,
  readSnapshot,
  writeSnapshot,
} from "@/lib/offline-cache";
import { ToastProvider, useToast } from "@/components/Toast";
import { Meter } from "@/components/Meter";
import BottomNav, { type Tab } from "@/components/BottomNav";
import Select from "@/components/Select";
import ThemeToggle from "@/components/ThemeToggle";
import GoalsCard from "@/components/GoalsCard";
import QuickAdd from "@/components/QuickAdd";
import EntryRow from "@/components/EntryRow";
import WeightCard from "@/components/WeightCard";
import TrendsCard from "@/components/TrendsCard";
import FoodSearch from "@/components/FoodSearch";
import TemplatesCard from "@/components/TemplatesCard";
import TdeeCard from "@/components/TdeeCard";
import ProductsCard from "@/components/ProductsCard";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
type Meal = (typeof MEALS)[number];

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function prettyDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  if (date === todayStr()) return "Today";
  if (date === shiftDate(todayStr(), -1)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const emptyForm = { name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "", sodium: "" };

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

const TABS: Tab[] = ["today", "trends", "weight", "settings"];
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
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "today";
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
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [goals, setGoals] = useState<Goals>({ dailyCalories: null, dailyProtein: null, dailyCarbs: null, dailyFat: null, dailyFiber: null, dailySugar: null, dailySodium: null, weightUnit: "kg", timezone: "UTC", sex: null, birthYear: null, heightCm: null });
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [recent, setRecent] = useState<RecentFood[]>([]);
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [trendDays, setTrendDays] = useState<7 | 30>(7);

  const [form, setForm] = useState(emptyForm);
  const [meal, setMeal] = useState<Meal>(mealForNow);
  const [showAdd, setShowAdd] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
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

  // Everything a snapshot needs beyond the day itself, held in a ref so that
  // writing one does not change `loadDay`'s identity — which would re-run the
  // day-loading effect every time a favorite changed.
  const auxRef = useRef({ email, goals, favorites, recent, weightLogs, templates });
  useEffect(() => {
    auxRef.current = { email, goals, favorites, recent, weightLogs, templates };
  }, [email, goals, favorites, recent, weightLogs, templates]);
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
        templates: aux.templates,
      });
    },
    [],
  );

  const loadDay = useCallback(async (d: string) => {
    const [{ entries }, sum] = await Promise.all([api.listEntries(d), api.summary(d)]);
    setEntries(entries);
    setSummary(sum);
    setLastLoaded(Date.now());
    // The screen is live again the moment a read succeeds.
    setStaleSince(null);
    setDaySnapshot(d, entries, sum);
  }, [setDaySnapshot]);

  const loadTrends = useCallback(async (days: 7 | 30) => {
    try {
      setTrends(await api.getTrends(days));
      setTrendsError(null);
    } catch (e) {
      // Swallowing this rendered a heading above nothing, forever. Keep any
      // trends already on screen and say that the refresh failed.
      setTrendsError(e instanceof Error ? e.message : "Could not load trends");
      throw e;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [{ user }, { goals: g }, { logs }, { favorites: favs, recent: rec }, { templates: tpls }, { apiKey: key }] =
          await Promise.all([api.me(), api.getGoals(), api.listWeight(), api.listFavorites(), api.listTemplates(), api.getApiKey()]);
        userIdRef.current = user.id;
        // A phone gets handed around. Anything stored for a different account
        // goes before this session can render a byte of it.
        clearSnapshotUnless(user.id);
        setEmail(user.email);
        setGoals(g);
        setWeightLogs(logs);
        setFavorites(favs);
        setRecent(rec);
        setTemplates(tpls);
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
          router.replace("/login");
          return;
        }

        // Offline. The installed app used to stop here at a dead end; show the
        // last reading this device took instead, stamped with when it was taken
        // and never presented as current.
        const snap = readSnapshot();
        if (snap) {
          userIdRef.current = snap.userId;
          setEmail(snap.email);
          setGoals(snap.goals);
          setFavorites(snap.favorites);
          setRecent(snap.recent);
          setWeightLogs(snap.weightLogs ?? []);
          setTemplates(snap.templates ?? []);
          // Only if it is the day being asked for. Painting yesterday's figures
          // under today's heading for one frame is exactly the lie this whole
          // path exists to avoid.
          if (snap.date === dateRef.current) {
            setEntries(snap.entries);
            setSummary(snap.summary);
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
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    loadDay(date)
      .then(() => setDayError(null))
      .catch((e: Error) => {
        // Offline, or the server is down. If this device holds a reading of
        // exactly this day, show it — labelled — rather than an error.
        const snap = readSnapshot();
        if (snap && snap.date === date && snap.userId === userIdRef.current) {
          setEntries(snap.entries);
          setSummary(snap.summary);
          setLastLoaded(snap.at);
          setStaleSince(snap.at);
          setDayError(null);
        } else {
          setEntries([]);
          setSummary(null);
          setStaleSince(null);
          setDayError(e.message);
        }
      });
  }, [ready, date, loadDay]);

  useEffect(() => {
    if (ready) loadTrends(trendDays).catch(() => {});
  }, [ready, trendDays, loadTrends]);

  // An installed PWA is not remounted when it comes back from the background, so
  // without this the screen keeps showing whatever it loaded hours ago — including
  // a day that Claude has since written to. Revalidate whenever we become visible,
  // and roll the date forward if we slept through midnight while sitting on today.
  const revalidate = useCallback(async () => {
    setRefreshing(true);
    try {
      const now = todayStr();
      const wasOnToday = date === todayRef.current;
      todayRef.current = now;

      if (wasOnToday && date !== now) {
        // Automatic, so replace rather than push — a midnight roll should not
        // become a back-button step.
        writeParams({ d: now }, "replace");
      } else {
        try {
          await loadDay(date);
        } catch (e) {
          // Only the day failing means the figures on screen are a past
          // reading. Say so, and keep them; the clock beside them is already
          // the time they were taken.
          setStaleSince(lastLoadedRef.current);
          throw e;
        }
      }

      const [{ favorites: favs, recent: rec }, { goals: g }] = await Promise.all([
        api.listFavorites(),
        api.getGoals(),
      ]);
      setFavorites(favs);
      setRecent(rec);
      setGoals(g);
      loadTrends(trendDays).catch(() => {});
    } catch {
      // A failed background refresh must not replace the data already on screen.
    } finally {
      setRefreshing(false);
    }
  }, [date, loadDay, loadTrends, trendDays, writeParams]);

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

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createEntry({
        name: form.name,
        calories: Number(form.calories),
        protein: form.protein ? Number(form.protein) : 0,
        carbs: form.carbs ? Number(form.carbs) : 0,
        fat: form.fat ? Number(form.fat) : 0,
        fiber: form.fiber ? Number(form.fiber) : 0,
        sugar: form.sugar ? Number(form.sugar) : 0,
        sodium: form.sodium ? Number(form.sodium) : 0,
        mealType: meal,
        consumedAt: consumedAtFor(date),
      });
      setForm(emptyForm);
      setShowAdd(false);
      setShowMore(false);
      toast(`Added ${form.name || "entry"}`);
      await loadDay(date);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add entry", "error");
    } finally {
      setSaving(false);
    }
  }

  function fillFromSearch(name: string, m: FoodMacros) {
    setForm((f) => ({
      ...f,
      name,
      calories: String(m.calories),
      protein: String(m.protein),
      carbs: String(m.carbs),
      fat: String(m.fat),
      fiber: String(m.fiber),
      sugar: String(m.sugar),
      sodium: String(m.sodium),
    }));
    setShowAdd(true);
    if (m.fiber || m.sugar || m.sodium) setShowMore(true);
    toast(`Filled “${name}” — review & add`, "info");
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
                api
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
                  })
                  .then(() => loadDay(date))
                  .catch(() => toast("Could not restore entry", "error"));
              },
            }
          : undefined,
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete entry", "error");
    }
  }

  function updateEntry(updated: FoodEntry) {
    // The row already holds the server's response, so re-fetching the list would
    // only replace it with itself — visibly, since React re-renders the row. Only
    // the day totals actually need recomputing.
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    api
      .summary(date)
      .then((sum) => {
        setSummary(sum);
        setLastLoaded(Date.now());
      })
      .catch(() => {});
  }

  const mcpUrl = apiKey ? `${origin}/api/mcp?key=${apiKey}` : "";

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
      setCopied(true);
      toast("Connector URL copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
      <main className="flex min-h-screen items-center justify-center p-3">
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

  // Per-day totals behind the week strip. Sourced from the trends payload already
  // in memory — no extra request — with the currently loaded day overridden by the
  // live summary so the strip moves the instant something is logged.
  const dayTotals = new Map<string, { calories: number; count: number }>();
  for (const d of trends?.nutrition ?? []) {
    dayTotals.set(d.date, { calories: d.calories, count: d.count });
  }
  if (summary) dayTotals.set(date, { calories: total.calories, count: total.count });

  return (
    <div className="mx-auto max-w-2xl px-3 pb-24 pt-3">
      {/* ── Today ─────────────────────────────────────── */}
      {tab === "today" && (
        <>
          {/* The other three tabs render a visible <h1>. Here the screen is the
              instrument itself; a visible title would repeat the strip and the
              date beneath it, but the document still needs a top-level heading. */}
          <h1 className="sr-only">{prettyDate(date)}</h1>
          {/* Week strip. Each cell reports that day's calorie total against the
              goal, so the strip is an instrument rather than a date picker. It is
              a report, not a score: no streak, no praise, no colour beyond the two
              the system already uses for in-range and over. */}
          <nav className="panel flex overflow-hidden" aria-label="Week">
            {weekEnding(stripEnding(date, todayStr())).map((d) => {
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
          {staleSince !== null && (
            <div
              className="mt-1.5 flex items-center justify-between gap-2 rounded border px-2 py-1.5"
              style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
              role="status"
            >
              <span className="text-2xs text-ink-dim">
                Offline — showing the reading from{" "}
                <span className="num">{clockTime(staleSince)}</span>. Claude may
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

          {date !== todayStr() && (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="num text-2xs uppercase tracking-wider text-ink-faint">
                {prettyDate(date)}
              </span>
              <div className="flex items-center gap-2">
                {/* Once the strip slides back to an older week there is no cell
                    for today to return to. */}
                <button
                  onClick={() => setDate(todayStr())}
                  className="text-2xs font-semibold uppercase tracking-wider text-accent hover:underline"
                >
                  Today
                </button>
                <input
                  type="date"
                  value={date}
                  max={todayStr()}
                  aria-label="Show a different day"
                  onChange={(e) => setDate(e.target.value)}
                  className="field num py-0.5 text-2xs"
                />
              </div>
            </div>
          )}

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
                  className="num ml-auto text-right text-sm font-semibold"
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
          <section className="panel mt-2 grid grid-cols-3 gap-x-4 gap-y-3 p-3">
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

          {/* Quick add */}
          {(favorites.length > 0 || recent.length > 0) && (
            <section className="panel mt-2 p-3">
              <QuickAdd
                favorites={favorites}
                recent={recent}
                selectedMeal={meal}
                selectedDate={date}
                onLogged={() => loadDay(date)}
                onFavoriteDeleted={(id) => setFavorites((f) => f.filter((x) => x.id !== id))}
                onFavoritesChanged={() =>
                  api.listFavorites().then(({ favorites: favs }) => setFavorites(favs)).catch(() => {})
                }
              />
            </section>
          )}

          {/* Saved products */}
          <Panel title="Products" hint="Saved labels" defaultOpen={false}>
            <ProductsCard
              date={date}
              defaultMeal={meal}
              onLogged={() => loadDay(date)}
            />
          </Panel>

          {/* Add food */}
          <Panel
            title="Add food"
            open={showAdd}
            onToggle={() => setShowAdd((s) => !s)}
          >
            <div className="space-y-2">
              <FoodSearch onPick={fillFromSearch} />
              <form onSubmit={addEntry} className="grid grid-cols-4 gap-1.5">
                <label className="col-span-4 block">
                  <span className="block text-2xs uppercase tracking-wider text-ink-faint">
                    Food
                  </span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="field mt-0.5 w-full"
                  />
                </label>
                {/* Labelled above, not by placeholder. `fillFromSearch` populates
                    all seven from Open Food Facts and asks the user to review
                    them — and populating a field is exactly what erases a
                    placeholder. Same labels as the row editor. */}
                <NumInput label="kcal" value={form.calories} onChange={(v) => setForm({ ...form, calories: v })} required />
                <NumInput label="Protein g" value={form.protein} onChange={(v) => setForm({ ...form, protein: v })} />
                <NumInput label="Carbs g" value={form.carbs} onChange={(v) => setForm({ ...form, carbs: v })} />
                <NumInput label="Fat g" value={form.fat} onChange={(v) => setForm({ ...form, fat: v })} />
                {showMore && (
                  <>
                    <NumInput label="Fiber g" value={form.fiber} onChange={(v) => setForm({ ...form, fiber: v })} />
                    <NumInput label="Sugar g" value={form.sugar} onChange={(v) => setForm({ ...form, sugar: v })} />
                    <NumInput label="Sodium mg" value={form.sodium} onChange={(v) => setForm({ ...form, sodium: v })} />
                    <div />
                  </>
                )}
                {/* Mirrors the shared meal state above; it does not own it. */}
                <Select
                  value={meal}
                  onChange={(e) => setMeal(e.target.value as Meal)}
                  aria-label="Meal"
                  wrapClassName="col-span-2"
                  className="capitalize"
                >
                  {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
                <button type="submit" disabled={saving} className="btn btn-primary col-span-2">
                  {saving ? "Adding…" : "Add"}
                </button>
                <div className="col-span-4 flex items-center gap-3 pt-0.5">
                  <button type="button" onClick={() => setShowMore((s) => !s)} className="text-2xs text-ink-faint hover:text-ink">
                    {showMore ? "− fewer" : "+ fiber / sugar / sodium"}
                  </button>
                  {form.name && form.calories && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.saveFavorite({ name: form.name, calories: Number(form.calories), protein: Number(form.protein) || 0, carbs: Number(form.carbs) || 0, fat: Number(form.fat) || 0, fiber: Number(form.fiber) || 0, sugar: Number(form.sugar) || 0, sodium: Number(form.sodium) || 0, mealType: meal });
                          const { favorites: favs } = await api.listFavorites();
                          setFavorites(favs);
                          toast("Saved to favorites");
                        }}
                        className="text-2xs text-accent hover:underline"
                      >
                        ★ favorite
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.saveProduct({
                            name: form.name,
                            calories: Number(form.calories) || 0,
                            protein: Number(form.protein) || 0,
                            carbs: Number(form.carbs) || 0,
                            fat: Number(form.fat) || 0,
                            fiber: Number(form.fiber) || 0,
                            sugar: Number(form.sugar) || 0,
                            sodium: Number(form.sodium) || 0,
                            basis: "100g",
                          });
                          toast("Saved to products (per 100g)");
                        }}
                        className="text-2xs text-accent hover:underline"
                      >
                        ⬚ product
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>
          </Panel>

          <Panel title="Copy &amp; templates" defaultOpen={false} bare>
            <TemplatesCard
              date={date}
              entries={entries}
              templates={templates}
              onTemplatesChange={setTemplates}
              onApplied={() => loadDay(date)}
            />
          </Panel>

          {/* Entries, grouped by meal */}
          <section className="mt-2">
            {dayError ? (
              <div className="panel px-3 py-8 text-center">
                <p className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                  This day could not be read
                </p>
                <p className="mt-1 text-xs text-ink-faint">{dayError}</p>
                <p className="mt-1 text-2xs text-ink-faint">
                  Offline, this device holds only its last reading of today.
                </p>
                <button
                  onClick={() => loadDay(date).then(() => setDayError(null)).catch(() => {})}
                  className="btn btn-primary mt-3"
                >
                  Retry
                </button>
              </div>
            ) : entries.length === 0 ? (
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
                      or let Claude log it for you
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
                      <span className="num text-2xs text-ink-faint">
                        {Math.round(summary?.byMeal[meal]?.calories ?? 0)} kcal
                      </span>
                    </div>
                    <ul className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
                      {items.map((entry) => (
                        <EntryRow key={entry.id} entry={entry} onUpdate={updateEntry} onDelete={removeEntry} />
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}

      {/* ── Trends ────────────────────────────────────── */}
      {tab === "trends" && (
        <>
          <Header>Trends</Header>
          {trends ? (
            <TrendsCard
              trends={trends}
              goals={goals}
              onDaysChange={(d) => setTrendDays(d)}
              onSetGoals={() => goTab("settings")}
            />
          ) : trendsError ? (
            <section className="panel p-3 text-center">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
                Trends unavailable
              </p>
              <p className="mt-1 text-xs text-ink-faint">{trendsError}</p>
              <button
                onClick={() => loadTrends(trendDays).catch(() => {})}
                className="btn btn-primary mt-3 w-full"
              >
                Retry
              </button>
            </section>
          ) : (
            <section className="panel p-3">
              <p className="text-2xs uppercase tracking-wider text-ink-faint">
                Loading…
              </p>
            </section>
          )}
          {trends && trendsError && (
            <p className="mt-1.5 text-2xs text-ink-faint">
              Last refresh failed — showing the previous reading. {trendsError}
            </p>
          )}
        </>
      )}

      {/* ── Weight ────────────────────────────────────── */}
      {tab === "weight" && (
        <>
          <Header>Weight</Header>
          <WeightCard logs={weightLogs} weightUnit={goals.weightUnit} onLogsChange={setWeightLogs} />
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

          <GoalsCard goals={goals} onGoalsChange={setGoals} />

          <div className="mt-2">
            <TdeeCard
              goals={goals}
              latestWeight={weightLogs.length ? weightLogs[weightLogs.length - 1].weight : null}
              onGoalsChange={setGoals}
            />
          </div>

          {/* The assistant is a front door, not a footnote: this used to be the
              last section on the screen, below Export. It sits above the archival
              controls now, and below Goals, which is where "Set a goal" lands. */}
          <section className="panel mt-2 p-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">Claude connector</h2>
            <p className="mt-1 text-2xs text-ink-faint">
              Claude.ai → Settings → Connectors → Add custom connector. Photograph a
              nutrition label and Claude saves it as a product you can re-log without
              another photo.
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <code className="num flex-1 truncate rounded px-2 py-1.5 text-2xs text-ink-dim" style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}>
                {mcpUrl || "…"}
              </code>
              <button onClick={copyUrl} disabled={!mcpUrl} className="btn btn-primary shrink-0">
                {copied ? "✓" : "Copy"}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-2xs">
              <span className="text-ink-faint">
                Timezone <span className="num text-ink-dim">{goals.timezone}</span>
              </span>
              <button onClick={regenerateKey} className="text-ink-faint hover:text-over">Regenerate key</button>
            </div>
          </section>

          <Panel title="Saved products" defaultOpen={false}>
            <ProductsCard date={date} defaultMeal="snack" manageOnly />
          </Panel>

          <section className="panel mt-2 p-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">Export</h2>
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={() => downloadExport("json")}
                disabled={exporting !== null}
                className="btn btn-ghost flex-1 text-center"
              >
                {exporting === "json" ? "Preparing…" : "JSON"}
              </button>
              <button
                onClick={() => downloadExport("csv")}
                disabled={exporting !== null}
                className="btn btn-ghost flex-1 text-center"
              >
                {exporting === "csv" ? "Preparing…" : "CSV"}
              </button>
            </div>
            <p className="mt-1.5 text-2xs text-ink-faint">
              JSON is everything: entries, weight, favorites, products, templates
              and your goals. CSV is entries only, with quantity and provenance.
            </p>
          </section>

          <div className="mt-3 flex items-center justify-between">
            {/* --accent on bare --bg measures 4.32:1; every other accent in the
                app sits on a panel at 5.02:1+. --ink-dim clears it here. */}
            <Link href="/api-docs" className="text-2xs text-ink-dim underline hover:text-ink">API docs ↗</Link>
            <button onClick={logout} className="btn btn-ghost">Log out</button>
          </div>
        </>
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
