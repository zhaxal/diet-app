"use client";

import { Dialog } from "./Dialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ isOpen, onClose }: Props) {
  const SHORTCUTS = [
    { keys: ["←", "→"], label: "Previous / next day" },
    { keys: ["T"], label: "Jump to today" },
    { keys: ["N", "/"], label: "Toggle Add Food" },
    { keys: ["1", "2", "3"], label: "Switch to Food, Workout, Settings" },
    { keys: ["?"], label: "Toggle keyboard shortcuts" },
    { keys: ["Esc"], label: "Close dialog" },
  ];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Keyboard Shortcuts"
      variant="center"
      size="sm"
      bodyClassName="p-3"
      footer={
        <div className="text-right">
          <button type="button" onClick={onClose} className="btn btn-primary text-2xs">
            Close
          </button>
        </div>
      }
    >
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
    </Dialog>
  );
}
