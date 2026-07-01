"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  type FoodEntry,
  type Summary,
  type Goals,
  type WeightLog,
  type Favorite,
  type RecentFood,
  type Trends,
  type MealTemplate,
  type FoodMacros,
} from "@/lib/api-client";
import { ToastProvider, useToast } from "@/components/Toast";
import { Ring } from "@/components/Ring";
import BottomNav, { type Tab } from "@/components/BottomNav";
import ThemeToggle from "@/components/ThemeToggle";
import GoalsCard from "@/components/GoalsCard";
import QuickAdd from "@/components/QuickAdd";
import EntryRow from "@/components/EntryRow";
import WeightCard from "@/components/WeightCard";
import TrendsCard from "@/components/TrendsCard";
import FoodSearch from "@/components/FoodSearch";
import TemplatesCard from "@/components/TemplatesCard";
import TdeeCard from "@/components/TdeeCard";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
type Meal = (typeof MEALS)[number];

const todayStr = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

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

const emptyForm = { name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "", sodium: "", mealType: "breakfast" as Meal };

const MACROS: { key: "protein" | "carbs" | "fat"; label: string; color: string; goalKey: keyof Goals }[] = [
  { key: "protein", label: "Protein", color: "#6366f1", goalKey: "dailyProtein" },
  { key: "carbs", label: "Carbs", color: "#f59e0b", goalKey: "dailyCarbs" },
  { key: "fat", label: "Fat", color: "#f43f5e", goalKey: "dailyFat" },
];

export default function Page() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}

function Dashboard() {
  const router = useRouter();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  const [date, setDate] = useState(todayStr());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [goals, setGoals] = useState<Goals>({ dailyCalories: null, dailyProtein: null, dailyCarbs: null, dailyFat: null, dailyFiber: null, dailySugar: null, dailySodium: null, weightUnit: "kg", timezone: "UTC", sex: null, birthYear: null, heightCm: null });
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [recent, setRecent] = useState<RecentFood[]>([]);
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [trendDays, setTrendDays] = useState<7 | 30>(7);

  const [form, setForm] = useState(emptyForm);
  const [showAdd, setShowAdd] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadDay = useCallback(async (d: string) => {
    const [{ entries }, sum] = await Promise.all([api.listEntries(d), api.summary(d)]);
    setEntries(entries);
    setSummary(sum);
  }, []);

  const loadTrends = useCallback(async (days: 7 | 30) => {
    setTrends(await api.getTrends(days));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [{ user }, { goals: g }, { logs }, { favorites: favs, recent: rec }, { templates: tpls }, { apiKey: key }] =
          await Promise.all([api.me(), api.getGoals(), api.listWeight(), api.listFavorites(), api.listTemplates(), api.getApiKey()]);
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
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  useEffect(() => {
    if (ready) loadDay(date).catch((e) => toast(e.message, "error"));
  }, [ready, date, loadDay, toast]);

  useEffect(() => {
    if (ready) loadTrends(trendDays).catch(() => {});
  }, [ready, trendDays, loadTrends]);

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
        mealType: form.mealType,
        consumedAt: new Date(`${date}T12:00:00`).toISOString(),
      });
      setForm({ ...emptyForm, mealType: form.mealType });
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
    await api.deleteEntry(id);
    toast("Entry deleted", "info");
    await loadDay(date);
  }

  function updateEntry(updated: FoodEntry) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    loadDay(date).catch(() => {});
  }

  const mcpUrl = apiKey ? `${origin}/api/mcp?key=${apiKey}` : "";

  async function copyUrl() {
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    toast("Connector URL copied");
    setTimeout(() => setCopied(false), 2000);
  }

  async function regenerateKey() {
    if (!confirm("Regenerate key? The old connector URL will stop working immediately.")) return;
    const { apiKey: newKey } = await api.regenerateApiKey();
    setApiKey(newKey);
    toast("New key generated", "info");
  }

  async function logout() {
    await api.logout();
    router.replace("/login");
  }

  if (!ready) {
    return <main className="flex min-h-screen items-center justify-center text-slate-400">Loading…</main>;
  }

  const total = summary?.total ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, count: 0 };
  const calGoal = goals.dailyCalories;
  const calRemaining = calGoal ? Math.max(calGoal - total.calories, 0) : 0;
  const calOver = calGoal ? total.calories > calGoal : false;

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-6">
      {/* ── Today ─────────────────────────────────────── */}
      {tab === "today" && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => setDate(shiftDate(date, -1))} className="rounded-full p-2 text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/10" aria-label="Previous day">
              <Chevron dir="left" />
            </button>
            <div className="text-center">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">{prettyDate(date)}</h1>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-0.5 bg-transparent text-center text-[11px] text-slate-400 outline-none"
              />
            </div>
            <button onClick={() => setDate(shiftDate(date, 1))} disabled={date >= todayStr()} className="rounded-full p-2 text-slate-400 hover:bg-slate-200/50 disabled:opacity-30 dark:hover:bg-white/10" aria-label="Next day">
              <Chevron dir="right" />
            </button>
          </div>

          {/* Hero rings */}
          <section className="surface mt-5 flex flex-col items-center p-6">
            <Ring value={total.calories} goal={calGoal} size={184} stroke={16}>
              <span className="text-4xl font-bold tnum text-slate-900 dark:text-white">
                {calGoal ? calRemaining : Math.round(total.calories)}
              </span>
              <span className="text-xs text-slate-400">
                {calGoal ? (calOver ? "kcal over" : "kcal left") : "kcal"}
              </span>
              {calGoal && <span className="mt-0.5 text-[11px] tnum text-slate-400">{Math.round(total.calories)} / {calGoal}</span>}
            </Ring>

            <div className="mt-6 grid w-full grid-cols-3 gap-2">
              {MACROS.map((m) => {
                const val = total[m.key];
                const goal = goals[m.goalKey] as number | null;
                return (
                  <div key={m.key} className="flex flex-col items-center">
                    <Ring value={val} goal={goal} size={76} stroke={8} color={m.color}>
                      <span className="text-sm font-bold tnum text-slate-800 dark:text-slate-100">{Math.round(val)}</span>
                      <span className="text-[9px] text-slate-400">{goal ? `/${goal}` : "g"}</span>
                    </Ring>
                    <span className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{m.label}</span>
                  </div>
                );
              })}
            </div>

            {(total.fiber > 0 || total.sugar > 0 || total.sodium > 0) && (
              <div className="mt-4 grid w-full grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center dark:border-white/5">
                {([["Fiber", total.fiber, goals.dailyFiber, "g"], ["Sugar", total.sugar, goals.dailySugar, "g"], ["Sodium", total.sodium, goals.dailySodium, "mg"]] as const).map(([label, val, goal, unit]) => (
                  <div key={label}>
                    <div className="text-sm font-semibold tnum text-slate-800 dark:text-slate-100">
                      {Math.round(val)}{goal ? <span className="text-xs font-normal text-slate-400">/{goal}</span> : ""}<span className="ml-0.5 text-[10px] text-slate-400">{unit}</span>
                    </div>
                    <div className="text-[10px] text-slate-400">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {(favorites.length > 0 || recent.length > 0) && (
            <section className="surface mt-4 p-4">
              <QuickAdd
                favorites={favorites}
                recent={recent}
                selectedMeal={form.mealType}
                selectedDate={date}
                onLogged={() => loadDay(date)}
                onFavoriteDeleted={(id) => setFavorites((f) => f.filter((x) => x.id !== id))}
              />
            </section>
          )}

          {/* Add food (collapsible) */}
          <section className="surface mt-4 p-4">
            <button onClick={() => setShowAdd((s) => !s)} className="flex w-full items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
              Add food
              <span className={`text-slate-400 transition-transform ${showAdd ? "rotate-45" : ""}`}>＋</span>
            </button>
            {showAdd && (
              <div className="mt-3 space-y-3">
                <FoodSearch onPick={fillFromSearch} />
                <form onSubmit={addEntry} className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
                  <input required placeholder="Food name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="col-span-2 rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/10 sm:col-span-2" />
                  <NumInput placeholder="Cal" value={form.calories} onChange={(v) => setForm({ ...form, calories: v })} required />
                  <NumInput placeholder="Protein" value={form.protein} onChange={(v) => setForm({ ...form, protein: v })} />
                  <NumInput placeholder="Carbs" value={form.carbs} onChange={(v) => setForm({ ...form, carbs: v })} />
                  <NumInput placeholder="Fat" value={form.fat} onChange={(v) => setForm({ ...form, fat: v })} />
                  {showMore && (
                    <>
                      <NumInput placeholder="Fiber" value={form.fiber} onChange={(v) => setForm({ ...form, fiber: v })} />
                      <NumInput placeholder="Sugar" value={form.sugar} onChange={(v) => setForm({ ...form, sugar: v })} />
                      <NumInput placeholder="Sodium mg" value={form.sodium} onChange={(v) => setForm({ ...form, sodium: v })} />
                    </>
                  )}
                  <select value={form.mealType} onChange={(e) => setForm({ ...form, mealType: e.target.value as Meal })} className="col-span-2 rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm capitalize outline-none focus:border-emerald-500 dark:border-white/10 sm:col-span-3 [&>option]:text-slate-900">
                    {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button type="submit" disabled={saving} className="col-span-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60 sm:col-span-3">
                    {saving ? "Adding…" : "Add entry"}
                  </button>
                  <div className="col-span-2 flex items-center gap-4 sm:col-span-6">
                    <button type="button" onClick={() => setShowMore((s) => !s)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      {showMore ? "− Fewer fields" : "+ Fiber / sugar / sodium"}
                    </button>
                    {form.name && form.calories && (
                      <button
                        type="button"
                        onClick={async () => {
                          await api.saveFavorite({ name: form.name, calories: Number(form.calories), protein: Number(form.protein) || 0, carbs: Number(form.carbs) || 0, fat: Number(form.fat) || 0, fiber: Number(form.fiber) || 0, sugar: Number(form.sugar) || 0, sodium: Number(form.sodium) || 0, mealType: form.mealType });
                          const { favorites: favs } = await api.listFavorites();
                          setFavorites(favs);
                          toast("Saved to favorites");
                        }}
                        className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        ★ Save as favorite
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}
          </section>

          <div className="mt-4">
            <TemplatesCard
              date={date}
              entries={entries}
              templates={templates}
              onTemplatesChange={setTemplates}
              onApplied={() => loadDay(date)}
            />
          </div>

          {/* Entries by meal */}
          <section className="mt-4 space-y-4">
            {MEALS.map((meal) => {
              const items = entries.filter((e) => e.mealType === meal);
              if (items.length === 0) return null;
              const mealCals = summary?.byMeal[meal]?.calories ?? 0;
              return (
                <div key={meal}>
                  <div className="mb-1.5 flex items-baseline justify-between px-1">
                    <h3 className="text-sm font-semibold capitalize text-slate-700 dark:text-slate-300">{meal}</h3>
                    <span className="text-xs tnum text-slate-400">{mealCals} kcal</span>
                  </div>
                  <ul className="surface divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
                    {items.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} onUpdate={updateEntry} onDelete={removeEntry} />
                    ))}
                  </ul>
                </div>
              );
            })}
            {entries.length === 0 && (
              <p className="surface px-4 py-10 text-center text-sm text-slate-400">No entries yet. Tap a favorite or “Add food”.</p>
            )}
          </section>
        </>
      )}

      {/* ── Trends ────────────────────────────────────── */}
      {tab === "trends" && (
        <>
          <h1 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">Trends</h1>
          {trends && <TrendsCard trends={trends} onDaysChange={(d) => setTrendDays(d)} />}
        </>
      )}

      {/* ── Weight ────────────────────────────────────── */}
      {tab === "weight" && (
        <>
          <h1 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">Weight</h1>
          <WeightCard logs={weightLogs} weightUnit={goals.weightUnit} onLogsChange={setWeightLogs} />
        </>
      )}

      {/* ── Settings ──────────────────────────────────── */}
      {tab === "settings" && (
        <>
          <h1 className="mb-1 text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
          <p className="mb-4 text-sm text-slate-400">{email}</p>

          <div className="mb-4 flex items-center justify-between surface p-4">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Appearance</span>
            <ThemeToggle />
          </div>

          <GoalsCard goals={goals} onGoalsChange={setGoals} />

          <div className="mt-4">
            <TdeeCard
              goals={goals}
              latestWeight={weightLogs.length ? weightLogs[weightLogs.length - 1].weight : null}
              onGoalsChange={setGoals}
            />
          </div>

          <section className="surface mt-4 p-5">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Export data</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Download all your entries, weight logs, favorites, and goals.</p>
            <div className="mt-3 flex gap-2">
              <a href="/api/export?format=json" download className="flex-1 rounded-xl bg-slate-800 py-2 text-center text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">Export JSON</a>
              <a href="/api/export?format=csv" download className="flex-1 rounded-xl border border-slate-300 py-2 text-center text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Export CSV (entries)</a>
            </div>
          </section>

          <section className="surface mt-4 p-5">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Claude.ai connector</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Paste into Claude.ai → Settings → Connectors → Add custom connector.</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded-xl bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700 dark:bg-white/5 dark:text-slate-300">{mcpUrl || "…"}</code>
              <button onClick={copyUrl} disabled={!mcpUrl} className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{copied ? "Copied!" : "Copy"}</button>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-slate-400">Timezone: <span className="text-slate-500 dark:text-slate-300">{goals.timezone}</span></span>
              <button onClick={regenerateKey} className="text-slate-400 hover:text-rose-500">Regenerate key</button>
            </div>
          </section>

          <div className="mt-4 flex items-center justify-between">
            <Link href="/api-docs" className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">API docs ↗</Link>
            <button onClick={logout} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Log out</button>
          </div>
        </>
      )}

      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

function NumInput({ value, onChange, placeholder, required }: { value: string; onChange: (v: string) => void; placeholder: string; required?: boolean }) {
  return (
    <input
      type="number"
      min={0}
      step="any"
      required={required}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm tnum outline-none focus:border-emerald-500 dark:border-white/10"
    />
  );
}
