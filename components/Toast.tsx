"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
/** An optional recovery affordance, so a destructive action need not be final. */
export interface ToastAction {
  label: string;
  onAct: () => void | Promise<void>;
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
    },
    [],
  );

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        data-toast-container
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 max-h-[45dvh] overflow-y-auto px-3"
      >
        {/* Stable live regions announce additions without moving keyboard focus. */}
        <div role="status" aria-live="polite" aria-relevant="additions text" className="flex flex-col items-center gap-2">
          {toasts.filter((t) => t.kind !== "error").map((t) => <ToastMessage key={t.id} toast={t} onDismiss={dismiss} />)}
        </div>
        <div role="alert" aria-live="assertive" aria-relevant="additions text" className="mt-2 flex flex-col items-center gap-2">
          {toasts.filter((t) => t.kind === "error").map((t) => <ToastMessage key={t.id} toast={t} onDismiss={dismiss} />)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastMessage({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    // Errors and recovery actions remain until used or explicitly dismissed.
    if (t.action || t.kind === "error" || hovered || focused) return;
    const timer = setTimeout(() => onDismiss(t.id), 4000);
    return () => clearTimeout(timer);
  }, [t, hovered, focused, onDismiss]);

  async function act() {
    if (!t.action || pending) return;
    setPending(true);
    try {
      await t.action.onAct();
      onDismiss(t.id);
    } catch {
      setFailure("Could not undo. Try again.");
    } finally { setPending(false); }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      className={`motion-toast pointer-events-auto flex w-full max-w-xl items-center gap-2 rounded px-3 py-2 text-sm font-medium shadow-lg ${t.kind === "success" ? "bg-accent" : t.kind === "error" ? "bg-over" : "bg-ink"} text-panel`}
    >
      <span className="min-w-0 flex-1 break-words">{failure ?? t.message}</span>
      {t.action && <button onClick={act} disabled={pending} className="shrink-0 border-l px-2 text-xs font-semibold" style={{ borderColor: "currentColor" }}>
        {pending ? "Undoing…" : t.action.label}
      </button>}
      <button onClick={() => onDismiss(t.id)} disabled={pending} aria-label={`Dismiss: ${t.message}`} className="glyph-btn">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
