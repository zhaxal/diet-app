"use client";

export type Tab = "today" | "trends" | "weight" | "settings";

const ICONS: Record<Tab, ReactNodePath> = {
  today: "M3 12l9-9 9 9M5 10v10h14V10",
  trends: "M3 17l6-6 4 4 8-8M21 7v6M21 7h-6",
  weight: "M12 3a4 4 0 014 4H8a4 4 0 014-4zM4 21l2-12h12l2 12z",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.5 7.5 0 000-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 00-1.7-1l-.4-2.6H10l-.4 2.6a7.5 7.5 0 00-1.7 1l-2.4-1-2 3.4L3.6 11a7.5 7.5 0 000 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 001.7 1l.4 2.6h3.8l.4-2.6a7.5 7.5 0 001.7-1l2.4 1 2-3.4z",
};
type ReactNodePath = string;

const LABELS: Record<Tab, string> = {
  today: "Today",
  trends: "Trends",
  weight: "Weight",
  settings: "Settings",
};

export default function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: Tab[] = ["today", "trends", "weight", "settings"];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/80 backdrop-blur-lg dark:border-white/10 dark:bg-[#131c2e]/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {tabs.map((t) => {
          const isActive = active === t;
          return (
            <button
              key={t}
              onClick={() => onChange(t)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={ICONS[t]} />
              </svg>
              {LABELS[t]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
