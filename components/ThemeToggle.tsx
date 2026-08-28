"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

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
    <div className="inline-flex rounded-full bg-panel-2 p-0.5">
      {(["light", "dark"] as Theme[]).map((t) => (
        <button
          key={t}
          onClick={() => apply(t)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            theme === t
              ? "bg-ink text-panel"
              : "text-ink-dim"
          }`}
        >
          {t === "light" ? "☀️" : "🌙"}
          <span className="capitalize">{t}</span>
        </button>
      ))}
    </div>
  );
}
