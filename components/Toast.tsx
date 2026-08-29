"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
/** An optional recovery affordance, so a destructive action need not be final. */
export interface ToastAction {
  label: string;
  onAct: () => void;
}
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

const ToastContext = createContext<
  (message: string, kind?: ToastKind, action?: ToastAction) => void
>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback(
    (message: string, kind: ToastKind = "success", action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, kind, action }]);
      // An undoable toast lingers: 2.8s is not long enough to notice a mistake.
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 2800);
    },
    [],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded px-4 py-2.5 text-sm font-medium shadow-lg ring-1 backdrop-blur transition-all
              ${
                // text-panel, not text-white: white on the dark theme's accent
                // measures 2.15:1. --panel clears 5:1 on every kind in both themes.
                t.kind === "success"
                  ? "bg-accent text-panel ring-transparent"
                  : t.kind === "error"
                    ? "bg-over text-panel ring-transparent"
                    : "bg-ink text-panel ring-transparent"
              }`}
            style={{ animation: "toastIn 0.25s ease" }}
          >
            <span>{t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "ℹ"}</span>
            {t.message}
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onAct();
                  setToasts((list) => list.filter((x) => x.id !== t.id));
                }}
                className="ml-1 border-l pl-2 text-2xs font-semibold uppercase tracking-wider"
                style={{ borderColor: "currentColor" }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </ToastContext.Provider>
  );
}
