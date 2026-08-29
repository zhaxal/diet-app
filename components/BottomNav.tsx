"use client";

import { CalendarDays, ChartColumn, Scale, Settings2, type LucideIcon } from "lucide-react";

export type Tab = "today" | "trends" | "weight" | "settings";

/*
 * Lucide, bundled through npm rather than fetched from a CDN — the self-hosting
 * constraint is about outbound dependencies at runtime, and these ship inside
 * the container like any other module. It replaces four hand-written paths that
 * came from three different grids: a 20-vertex gear that went muddy at 22px, a
 * stroked-but-closed weight silhouette that read as filled, and a house, which
 * means "home" and not "today".
 *
 * The four chosen glyphs are optically distinct at 22px — frame, bars, balance,
 * sliders — so the bar is scannable by silhouette before the labels are read.
 */
const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  // A day is the unit of this product, and the week strip above is a calendar.
  { id: "today", label: "Today", Icon: CalendarDays },
  // Bars, because the tab's own chart is a bar chart.
  { id: "trends", label: "Trends", Icon: ChartColumn },
  { id: "weight", label: "Weight", Icon: Scale },
  // Sliders rather than a gear: fewer vertices at this size, and it echoes the
  // meter tracks that make up most of the settings it opens.
  { id: "settings", label: "Settings", Icon: Settings2 },
];

export default function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
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
