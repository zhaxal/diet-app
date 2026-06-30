"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  type FoodEntry,
  type Summary,
} from "@/lib/api-client";

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
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (d: string) => {
    const [{ entries }, sum] = await Promise.all([
      api.listEntries(d),
      api.summary(d),
    ]);
    setEntries(entries);
    setSummary(sum);
  }, []);

  // Auth gate: confirm the session, then load the day's data.
  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.me();
        setEmail(user.email);
        setReady(true);
        const { apiKey: key } = await api.getApiKey();
        setApiKey(key);
        setOrigin(window.location.origin);
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  useEffect(() => {
    if (ready) load(date).catch((e) => setError(e.message));
  }, [ready, date, load]);

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
        // Anchor the entry to noon of the selected day in local time.
        consumedAt: new Date(`${date}T12:00:00`).toISOString(),
      });
      setForm({ ...emptyForm, mealType: form.mealType });
      await load(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await api.deleteEntry(id);
    await load(date);
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
          <Link href="/api-docs" className="text-emerald-600 hover:underline">
            API docs
          </Link>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Date picker + daily totals */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <div className="text-sm text-slate-500">
            {summary?.total.count ?? 0} entries
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Calories" value={total?.calories ?? 0} unit="kcal" big />
          <Stat label="Protein" value={total?.protein ?? 0} unit="g" />
          <Stat label="Carbs" value={total?.carbs ?? 0} unit="g" />
          <Stat label="Fat" value={total?.fat ?? 0} unit="g" />
        </div>
      </section>

      {/* Add entry */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">Add food</h2>
        <form
          onSubmit={addEntry}
          className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6"
        >
          <input
            required
            placeholder="Food name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <NumInput
            placeholder="Cal"
            value={form.calories}
            onChange={(v) => setForm({ ...form, calories: v })}
            required
          />
          <NumInput
            placeholder="Protein"
            value={form.protein}
            onChange={(v) => setForm({ ...form, protein: v })}
          />
          <NumInput
            placeholder="Carbs"
            value={form.carbs}
            onChange={(v) => setForm({ ...form, carbs: v })}
          />
          <NumInput
            placeholder="Fat"
            value={form.fat}
            onChange={(v) => setForm({ ...form, fat: v })}
          />
          <select
            value={form.mealType}
            onChange={(e) =>
              setForm({ ...form, mealType: e.target.value as Meal })
            }
            className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm capitalize sm:col-span-3"
          >
            {MEALS.map((m) => (
              <option key={m} value={m} className="capitalize">
                {m}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="col-span-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 sm:col-span-3"
          >
            {saving ? "Adding…" : "Add entry"}
          </button>
        </form>
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
                <h3 className="text-sm font-semibold capitalize text-slate-700">
                  {meal}
                </h3>
                <span className="text-xs text-slate-400">{mealCals} kcal</span>
              </div>
              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                {items.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {entry.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {entry.calories} kcal · P{entry.protein} · C{entry.carbs}{" "}
                        · F{entry.fat}
                      </p>
                    </div>
                    <button
                      onClick={() => remove(entry.id)}
                      className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </li>
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

      {/* Claude.ai connector card */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">Claude.ai connector</h2>
        <p className="mt-1 text-xs text-slate-500">
          Paste this URL into Claude.ai → Settings → Connectors → Add custom connector.
          The key is embedded — no extra config needed.
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

function Stat({
  label,
  value,
  unit,
  big,
}: {
  label: string;
  value: number;
  unit: string;
  big?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={big ? "text-2xl font-semibold" : "text-lg font-semibold"}>
        {Math.round(value * 10) / 10}
        <span className="ml-1 text-xs font-normal text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
}) {
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
