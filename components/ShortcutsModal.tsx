"use client";

import { useEffect } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const SHORTCUTS = [
    { keys: ["←", "→"], label: "Previous / next day" },
    { keys: ["T"], label: "Jump to today" },
    { keys: ["N", "/"], label: "Toggle Add Food" },
    { keys: ["1", "2", "3"], label: "Switch to Food, Workout, Settings" },
    { keys: ["?"], label: "Toggle keyboard shortcuts" },
    { keys: ["Esc"], label: "Close dialog" },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: "color-mix(in srgb, var(--panel) 70%, transparent)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel w-full max-w-sm overflow-hidden" role="document">
        <div
          className="flex items-center justify-between border-b px-3 py-1.5"
          style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
        >
          <span id="shortcuts-title" className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
            Keyboard Shortcuts
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts dialog"
            className="text-ink-faint hover:text-ink font-mono text-sm leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="p-3">
          <ul className="divide-y text-xs" style={{ borderColor: "var(--line-soft)" }}>
            {SHORTCUTS.map((s, idx) => (
              <li key={idx} className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                <span className="text-ink-dim">{s.label}</span>
                <span className="flex items-center gap-1">
                  {s.keys.map((k, ki) => (
                    <kbd
                      key={ki}
                      className="num rounded border px-1.5 py-0.5 text-2xs text-ink"
                      style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="border-t px-3 py-2 text-right"
          style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
        >
          <button type="button" onClick={onClose} className="btn btn-primary text-2xs">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
