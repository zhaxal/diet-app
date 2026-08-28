"use client";

import { useState } from "react";
import { api, type FoodEntry, type MealTemplate, type TemplateItem } from "@/lib/api-client";
import { useToast } from "./Toast";

interface Props {
  date: string;
  entries: FoodEntry[];
  templates: MealTemplate[];
  onTemplatesChange: (t: MealTemplate[]) => void;
  onApplied: () => void;
}

export default function TemplatesCard({ date, entries, templates, onTemplatesChange, onApplied }: Props) {
  const toast = useToast();
  const [copyFrom, setCopyFrom] = useState(date);
  const [busy, setBusy] = useState(false);

  async function copyDay() {
    setBusy(true);
    try {
      const { copied } = await api.copyDay(copyFrom, date);
      if (copied === 0) toast("No entries on that day", "info");
      else {
        toast(`Copied ${copied} entr${copied === 1 ? "y" : "ies"}`);
        onApplied();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Copy failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveAsTemplate() {
    if (entries.length === 0) {
      toast("Nothing logged today to save", "info");
      return;
    }
    const name = prompt("Name this template (e.g. 'Usual breakfast')");
    if (!name) return;
    const items: TemplateItem[] = entries.map((e) => ({
      name: e.name, calories: e.calories, protein: e.protein, carbs: e.carbs,
      fat: e.fat, fiber: e.fiber, sugar: e.sugar, sodium: e.sodium, mealType: e.mealType,
    }));
    try {
      const { template } = await api.saveTemplate(name, items);
      onTemplatesChange([template, ...templates]);
      toast("Template saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save template", "error");
    }
  }

  async function apply(t: MealTemplate) {
    try {
      const { added } = await api.applyTemplate(t.id, date);
      toast(`Added ${added} item${added === 1 ? "" : "s"} from ${t.name}`);
      onApplied();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to apply", "error");
    }
  }

  async function remove(t: MealTemplate) {
    await api.deleteTemplate(t.id);
    onTemplatesChange(templates.filter((x) => x.id !== t.id));
    toast("Template deleted", "info");
  }

  return (
    <div className="px-3 py-2.5">
      {(
        <div className="space-y-3">
          {/* Copy a previous day */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-dim">Copy a day&apos;s meals to {date}</p>
            <div className="flex gap-2">
              <input type="date" max={date} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="flex-1 rounded border border-line bg-transparent px-3 py-2 text-sm outline-none" />
              <button onClick={copyDay} disabled={busy} className="btn btn-primary">Copy</button>
            </div>
          </div>

          {/* Templates */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-medium text-ink-dim">Templates</p>
              <button onClick={saveAsTemplate} className="text-xs text-accent hover:underline">★ Save today</button>
            </div>
            {templates.length === 0 ? (
              <p className="text-xs text-ink-faint">No templates yet. Log a day, then “Save today”.</p>
            ) : (
              <ul className="space-y-1.5">
                {templates.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 rounded bg-panel-2 px-3 py-2">
                    <span className="min-w-0 truncate text-sm text-ink">{t.name} <span className="text-xs text-ink-faint">· {t.items.length} items</span></span>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => apply(t)} className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white">Apply</button>
                      <button onClick={() => remove(t)} className="text-xs text-ink-faint hover:text-over">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
