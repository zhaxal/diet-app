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
    <div className="inline-flex rounded-full bg-slate-100 p-0.5 dark:bg-white/10">
      {(["light", "dark"] as Theme[]).map((t) => (
        <button
          key={t}
          onClick={() => apply(t)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            theme === t
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {t === "light" ? "☀️" : "🌙"}
          <span className="capitalize">{t}</span>
        </button>
      ))}
    </div>
  );
}
