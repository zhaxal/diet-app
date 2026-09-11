"use client";

import { Utensils, Dumbbell, Settings2, type LucideIcon } from "lucide-react";

export type Tab = "food" | "workout" | "settings";

/*
 * Lucide, bundled through npm rather than fetched from a CDN — the self-hosting
 * constraint is about outbound dependencies at runtime, and these ship inside
 * the container like any other module.
 */
const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  // Primary diet, nutrition logging, contextual weight and trends
  { id: "food", label: "Food", Icon: Utensils },
  // Dumbbell for the gym / workout tracker
  { id: "workout", label: "Workout", Icon: Dumbbell },
  // Sliders rather than a gear
  { id: "settings", label: "Settings", Icon: Settings2 },
];


export default function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-lg"
      style={{
        borderColor: "var(--line)",
        background: "color-mix(in srgb, var(--panel) 88%, transparent)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-2xs font-medium tracking-wider transition-colors ${
                isActive ? "text-accent" : "text-ink-faint"
              }`}
            >
              {/* Colour and stroke weight carry the state; the system has no
                  indicator bar, pill or underline. */}
              <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
