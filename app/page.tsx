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
} from "@/lib/api-client";
import GoalsCard from "@/components/GoalsCard";
import QuickAdd from "@/components/QuickAdd";
import EntryRow from "@/components/EntryRow";
import WeightCard from "@/components/WeightCard";
import TrendsCard from "@/components/TrendsCard";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
type Meal = (typeof MEALS)[number];

const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  name: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  mealType: "breakfast" as Meal,
};

export default function Dashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  const [date, setDate] = useState(todayStr());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [goals, setGoals] = useState<Goals>({ dailyCalories: null, dailyProtein: null, dailyCarbs: null, dailyFat: null, weightUnit: "kg" });
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [recent, setRecent] = useState<RecentFood[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [trendDays, setTrendDays] = useState<7 | 30>(7);

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadDay = useCallback(async (d: string) => {
    const [{ entries }, sum] = await Promise.all([api.listEntries(d), api.summary(d)]);
    setEntries(entries);
    setSummary(sum);
  }, []);

  const loadTrends = useCallback(async (days: 7 | 30) => {
    const t = await api.getTrends(days);
    setTrends(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [{ user }, { goals: g }, { logs }, { favorites: favs, recent: rec }, { apiKey: key }] =
          await Promise.all([api.me(), api.getGoals(), api.listWeight(), api.listFavorites(), api.getApiKey()]);
        setEmail(user.email);
        setGoals(g);
        setWeightLogs(logs);
        setFavorites(favs);
        setRecent(rec);
        setApiKey(key);
        setOrigin(window.location.origin);
        setReady(true);
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  useEffect(() => {
    if (ready) {
      loadDay(date).catch((e) => setError(e.message));
      loadTrends(trendDays).catch(() => {});
    }
  }, [ready, date, trendDays, loadDay, loadTrends]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.createEntry({
        name: form.name,
        calories: Number(form.calories),
        protein: form.protein ? Number(form.protein) : 0,
        carbs: form.carbs ? Number(form.carbs) : 0,
        fat: form.fat ? Number(form.fat) : 0,
        mealType: form.mealType,
        consumedAt: new Date(`${date}T12:00:00`).toISOString(),
      });
      setForm({ ...emptyForm, mealType: form.mealType });
      await loadDay(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: string) {
    await api.deleteEntry(id);
    await loadDay(date);
  }

  function updateEntry(updated: FoodEntry) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    // Recalculate summary locally for instant feedback.
    loadDay(date).catch(() => {});
  }

  async function logout() {
    await api.logout();
    router.replace("/login");
  }

  const mcpUrl = apiKey ? `${origin}/api/mcp?key=${apiKey}` : "";

  async function copyUrl() {
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function regenerateKey() {
    if (!confirm("Regenerate key? The old connector URL will stop working immediately.")) return;
    const { apiKey: newKey } = await api.regenerateApiKey();
    setApiKey(newKey);
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-400">
        Loading…
      </main>
    );
  }

  const total = summary?.total;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">🥗 Diet Tracker</h1>
          <p className="text-sm text-slate-500">{email}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/api-docs" className="text-emerald-600 hover:underline">API docs</Link>
          <button onClick={logout} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
            Log out
          </button>
        </div>
      </header>

      {/* Date picker */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <div className="text-sm text-slate-500">{summary?.total.count ?? 0} entries</div>
        </div>
      </section>

      {/* Goals + progress */}
      <div className="mt-6">
        <GoalsCard goals={goals} total={total ?? { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 }} onGoalsChange={setGoals} />
      </div>

      {/* Quick-add */}
      {(favorites.length > 0 || recent.length > 0) && (
        <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Quick add</h2>
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

      {/* Add entry form */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">Add food</h2>
        <form onSubmit={addEntry} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <input
            required
            placeholder="Food name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <NumInput placeholder="Cal" value={form.calories} onChange={(v) => setForm({ ...form, calories: v })} required />
          <NumInput placeholder="Protein" value={form.protein} onChange={(v) => setForm({ ...form, protein: v })} />
          <NumInput placeholder="Carbs" value={form.carbs} onChange={(v) => setForm({ ...form, carbs: v })} />
          <NumInput placeholder="Fat" value={form.fat} onChange={(v) => setForm({ ...form, fat: v })} />
          <select
            value={form.mealType}
            onChange={(e) => setForm({ ...form, mealType: e.target.value as Meal })}
            className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm capitalize sm:col-span-3"
          >
            {MEALS.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="col-span-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 sm:col-span-3"
          >
            {saving ? "Adding…" : "Add entry"}
          </button>
        </form>
        {/* Save to favorites shortcut */}
        {form.name && form.calories && (
          <button
            type="button"
            onClick={async () => {
              await api.saveFavorite({
                name: form.name,
                calories: Number(form.calories),
                protein: form.protein ? Number(form.protein) : 0,
                carbs: form.carbs ? Number(form.carbs) : 0,
                fat: form.fat ? Number(form.fat) : 0,
                mealType: form.mealType,
              });
              const { favorites: favs } = await api.listFavorites();
              setFavorites(favs);
            }}
            className="mt-2 text-xs text-emerald-600 hover:underline"
          >
            ★ Save as favorite
          </button>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      {/* Entries grouped by meal */}
      <section className="mt-6 space-y-5">
        {MEALS.map((meal) => {
          const items = entries.filter((e) => e.mealType === meal);
          if (items.length === 0) return null;
          const mealCals = summary?.byMeal[meal]?.calories ?? 0;
          return (
            <div key={meal}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold capitalize text-slate-700">{meal}</h3>
                <span className="text-xs text-slate-400">{mealCals} kcal</span>
              </div>
              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                {items.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} onUpdate={updateEntry} onDelete={removeEntry} />
                ))}
              </ul>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p className="rounded-xl bg-white px-4 py-8 text-center text-sm text-slate-400 shadow-sm ring-1 ring-slate-200">
            No entries for this day yet. Add your first meal above.
          </p>
        )}
      </section>

      {/* Weight + Trends */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <WeightCard logs={weightLogs} weightUnit={goals.weightUnit} onLogsChange={setWeightLogs} />
        {trends && (
          <TrendsCard
            trends={trends}
            weightUnit={goals.weightUnit}
            onDaysChange={(d) => { setTrendDays(d); loadTrends(d); }}
          />
        )}
      </div>

      {/* Claude.ai connector card */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">Claude.ai connector</h2>
        <p className="mt-1 text-xs text-slate-500">
          Paste this URL into Claude.ai → Settings → Connectors → Add custom connector.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 ring-1 ring-slate-200">
            {mcpUrl || "Loading…"}
          </code>
          <button
            onClick={copyUrl}
            disabled={!mcpUrl}
            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {copied ? "Copied!" : "Copy URL"}
          </button>
          <button
            onClick={regenerateKey}
            disabled={!apiKey}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Regenerate
          </button>
        </div>
      </section>
    </main>
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
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
    />
  );
}
