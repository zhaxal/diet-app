"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun, type LucideIcon } from "lucide-react";

type Theme = "light" | "dark";

// One icon family across the app: these were hand-drawn paths approximating the
// same two glyphs at a slightly different weight to the nav's.
const ICONS: Record<Theme, LucideIcon> = { light: Sun, dark: Moon };

const themeListeners = new Set<() => void>();

function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  return () => {
    themeListeners.delete(cb);
  };
}

function getThemeSnapshot(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  function apply(next: Theme) {
    document.documentElement.classList.toggle("dark", next === "dark");
    // The iOS status bar strip is painted from theme-color, so it has to move
    // with the theme or it sits as a black band above a light page.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#090c11" : "#eceef1");
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore
    }
    for (const listener of themeListeners) listener();
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
            type="button"
            onClick={() => apply(t)}
            aria-pressed={active}
            className="motion-segment flex items-center gap-1.5 border-r px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider transition-colors last:border-r-0"
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
