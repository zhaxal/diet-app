"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { ToastProvider, useToast } from "@/components/Toast";
import { Meter } from "@/components/Meter";
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
import ProductsCard from "@/components/ProductsCard";

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
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="num text-xs uppercase tracking-widest text-ink-faint">
          Loading
        </span>
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
    <div className="mx-auto max-w-2xl px-3 pb-24 pt-3">
      {/* ── Today ─────────────────────────────────────── */}
      {tab === "today" && (
        <>
          {/* Week strip */}
          <nav className="panel flex overflow-hidden">
            {weekEnding(todayStr()).map((d) => {
              const active = d === date;
              const dt = new Date(`${d}T00:00:00`);
              return (
                <button
                  key={d}
                  onClick={() => setDate(d)}
                  className="flex-1 border-r py-1.5 text-center last:border-r-0 transition-colors"
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
                </button>
              );
            })}
          </nav>

          {date !== todayStr() && (
            <div className="mt-1.5 flex items-center justify-between">
              <span className="num text-2xs uppercase tracking-wider text-ink-faint">
                {prettyDate(date)}
              </span>
              <input
                type="date"
                value={date}
                max={todayStr()}
                onChange={(e) => setDate(e.target.value)}
                className="field num py-0.5 text-2xs"
              />
            </div>
          )}

          {/* Calorie readout */}
          <section className="panel gridlines mt-2 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xs uppercase tracking-wider text-ink-faint">
                Calories
              </span>
              <span className="num text-2xs text-ink-faint">
                {total.count} {total.count === 1 ? "entry" : "entries"}
              </span>
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
              {calGoal && (
                <span
                  className="num ml-auto text-right text-sm font-semibold"
                  style={{ color: calOver ? "var(--over)" : "var(--ok)" }}
                >
                  {Math.abs(calLeft).toLocaleString()}
                  <span className="ml-1 text-2xs uppercase tracking-wider opacity-80">
                    {calOver ? "over" : "left"}
                  </span>
                </span>
              )}
            </div>

            <div
              className="mt-2 w-full overflow-hidden rounded-sm"
              style={{ height: 8, background: "var(--line-soft)" }}
            >
              <div
                className="h-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${calGoal ? calPct : 0}%`,
                  background: calOver ? "var(--over)" : "var(--accent)",
                }}
              />
            </div>
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

          {/* Quick add */}
          {(favorites.length > 0 || recent.length > 0) && (
            <section className="panel mt-2 p-3">
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

          {/* Saved products */}
          <Panel title="Products" hint="Saved labels" defaultOpen={false}>
            <ProductsCard
              date={date}
              defaultMeal={form.mealType}
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
                <input
                  required
                  placeholder="Food name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="field col-span-4"
                />
                <NumInput placeholder="kcal" value={form.calories} onChange={(v) => setForm({ ...form, calories: v })} required />
                <NumInput placeholder="P" value={form.protein} onChange={(v) => setForm({ ...form, protein: v })} />
                <NumInput placeholder="C" value={form.carbs} onChange={(v) => setForm({ ...form, carbs: v })} />
                <NumInput placeholder="F" value={form.fat} onChange={(v) => setForm({ ...form, fat: v })} />
                {showMore && (
                  <>
                    <NumInput placeholder="fiber" value={form.fiber} onChange={(v) => setForm({ ...form, fiber: v })} />
                    <NumInput placeholder="sugar" value={form.sugar} onChange={(v) => setForm({ ...form, sugar: v })} />
                    <NumInput placeholder="Na mg" value={form.sodium} onChange={(v) => setForm({ ...form, sodium: v })} />
                    <div />
                  </>
                )}
                <select
                  value={form.mealType}
                  onChange={(e) => setForm({ ...form, mealType: e.target.value as Meal })}
                  className="field col-span-2 capitalize [&>option]:text-black"
                >
                  {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
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
                          await api.saveFavorite({ name: form.name, calories: Number(form.calories), protein: Number(form.protein) || 0, carbs: Number(form.carbs) || 0, fat: Number(form.fat) || 0, fiber: Number(form.fiber) || 0, sugar: Number(form.sugar) || 0, sodium: Number(form.sodium) || 0, mealType: form.mealType });
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
            {entries.length === 0 ? (
              <p className="panel px-3 py-8 text-center text-xs text-ink-faint">
                Nothing logged. Use a favorite, a saved product, or Add food.
              </p>
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
          {trends && <TrendsCard trends={trends} onDaysChange={(d) => setTrendDays(d)} />}
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

          <Panel title="Saved products" defaultOpen={false}>
            <ProductsCard date={date} defaultMeal="snack" manageOnly />
          </Panel>

          <section className="panel mt-2 p-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">Export</h2>
            <div className="mt-2 flex gap-1.5">
              <a href="/api/export?format=json" download className="btn btn-ghost flex-1 text-center">JSON</a>
              <a href="/api/export?format=csv" download className="btn btn-ghost flex-1 text-center">CSV</a>
            </div>
          </section>

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

          <div className="mt-3 flex items-center justify-between">
            <Link href="/api-docs" className="text-2xs text-accent hover:underline">API docs ↗</Link>
            <button onClick={logout} className="btn btn-ghost">Log out</button>
          </div>
        </>
      )}

      <BottomNav active={tab} onChange={setTab} />
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

  return (
    <section className="panel mt-2">
      <button
        onClick={toggle}
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
        <div className={bare ? "" : "border-t px-3 py-2.5"} style={bare ? undefined : { borderColor: "var(--line)" }}>
          {children}
        </div>
      )}
    </section>
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
      className="field num text-right"
    />
  );
}
