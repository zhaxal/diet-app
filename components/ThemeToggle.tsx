"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, type LucideIcon } from "lucide-react";

type Theme = "light" | "dark";

// One icon family across the app: these were hand-drawn paths approximating the
// same two glyphs at a slightly different weight to the nav's.
const ICONS: Record<Theme, LucideIcon> = { light: Sun, dark: Moon };

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore
    }
  }

  return (
    <div
      className="inline-flex overflow-hidden rounded border"
      style={{ borderColor: "var(--line)" }}
      role="group"
      aria-label="Theme"
    >
      {(["light", "dark"] as Theme[]).map((t) => {
        const active = theme === t;
        const Icon = ICONS[t];
        return (
          <button
            key={t}
            onClick={() => apply(t)}
            aria-pressed={active}
            className="flex items-center gap-1.5 border-r px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider transition-colors last:border-r-0"
            style={{
              borderColor: "var(--line)",
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--panel)" : "var(--ink-dim)",
            }}
          >
            <Icon size={13} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
            {t}
          </button>
        );
      })}
    </div>
  );
}
