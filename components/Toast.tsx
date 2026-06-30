"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ring-1 backdrop-blur transition-all
              ${
                t.kind === "success"
                  ? "bg-emerald-600/95 text-white ring-emerald-400/30"
                  : t.kind === "error"
                    ? "bg-rose-600/95 text-white ring-rose-400/30"
                    : "bg-slate-800/95 text-white ring-white/10"
              }`}
            style={{ animation: "toastIn 0.25s ease" }}
          >
            <span>{t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "ℹ"}</span>
            {t.message}
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </ToastContext.Provider>
  );
}
