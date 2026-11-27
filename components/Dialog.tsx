"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAnimatedDisclosure } from "@/lib/useAnimatedDisclosure";

type DialogSize = "sm" | "md" | "lg" | "xl";
type DialogVariant = "responsive" | "center" | "fullscreen";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  ariaDescribedBy?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  variant?: DialogVariant;
  role?: "dialog" | "alertdialog";
  closeOnBackdrop?: boolean;
  showClose?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  bodyClassName?: string;
}

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const SIZE: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-2xl",
};

function getPortalRoot() {
  const existing = document.getElementById("app-dialog-root");
  if (existing) return existing;
  const root = document.createElement("div");
  root.id = "app-dialog-root";
  document.body.appendChild(root);
  return root;
}

let portalRootCache: HTMLElement | null = null;
const portalListeners = new Set<() => void>();

function subscribePortal(cb: () => void) {
  portalListeners.add(cb);
  if (!portalRootCache && typeof document !== "undefined") {
    queueMicrotask(() => {
      if (!portalRootCache) {
        portalRootCache = getPortalRoot();
        for (const listener of portalListeners) listener();
      }
    });
  }
  return () => {
    portalListeners.delete(cb);
  };
}

function getPortalSnapshot() {
  return portalRootCache;
}

function getPortalServerSnapshot() {
  return null;
}

let activeDialogCount = 0;
let savedBodyOverflow = "";
let savedBackgroundState: Array<{
  node: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
}> = [];

export function Dialog({
  open,
  onClose,
  title,
  description,
  ariaDescribedBy,
  children,
  footer,
  size = "md",
  variant = "responsive",
  role = "dialog",
  closeOnBackdrop = true,
  showClose = true,
  initialFocusRef,
  bodyClassName = "p-4",
}: DialogProps) {
  const portalRoot = useSyncExternalStore(
    subscribePortal,
    getPortalSnapshot,
    getPortalServerSnapshot,
  );
  const { rendered, closing, onAnimationEnd } = useAnimatedDisclosure(open, 220);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const active = rendered;

  useEffect(() => {
    if (!active || !portalRoot) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (activeDialogCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      savedBackgroundState = Array.from(document.body.children)
        .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== portalRoot)
        .map((node) => ({
          node,
          inert: node.inert,
          ariaHidden: node.getAttribute("aria-hidden"),
        }));

      document.body.style.overflow = "hidden";
      for (const item of savedBackgroundState) {
        item.node.inert = true;
        item.node.setAttribute("aria-hidden", "true");
      }
    }
    activeDialogCount += 1;

    const frame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? closeRef.current ?? dialogRef.current;
      target?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((node) => !node.hasAttribute("disabled") && node.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (!dialogRef.current.contains(current) || current === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      activeDialogCount = Math.max(0, activeDialogCount - 1);
      if (activeDialogCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
        for (const item of savedBackgroundState) {
          item.node.inert = item.inert;
          if (item.ariaHidden === null) item.node.removeAttribute("aria-hidden");
          else item.node.setAttribute("aria-hidden", item.ariaHidden);
        }
        savedBackgroundState = [];
      }
      previousFocus?.focus();
    };
  }, [active, initialFocusRef, portalRoot]);

  if (!rendered || !portalRoot) return null;

  const overlayClass =
    variant === "fullscreen"
      ? "items-stretch"
      : variant === "center"
        ? "items-center justify-center p-3 sm:p-4"
        : "items-end justify-center p-0 sm:items-center sm:p-4";
  const panelClass =
    variant === "fullscreen"
      ? "min-h-dvh w-full"
      : variant === "center"
        ? `max-h-[88dvh] w-full rounded border ${SIZE[size]}`
        : `max-h-[92dvh] w-full rounded-t border sm:max-h-[86dvh] sm:rounded ${SIZE[size]}`;

  return createPortal(
    <div
      className={`motion-dialog-scrim ${closing ? "motion-dialog-scrim--closing" : ""} fixed inset-0 z-[60] flex ${overlayClass}`}
      onPointerDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : ariaDescribedBy}
        tabIndex={-1}
        onAnimationEnd={onAnimationEnd}
        className={`motion-dialog-panel ${variant === "fullscreen" ? "motion-dialog-panel--fullscreen" : ""} ${closing ? "motion-dialog-panel--closing" : ""} flex min-h-0 flex-col overflow-hidden ${panelClass}`}
        style={{
          background: "var(--panel)",
          borderColor: "var(--line)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5"
          style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
        >
          <div className="min-w-0">
            {/* Every other header in the system is uppercase with tracking;
                dialog titles were the one Title Case sentence left. The
                transform is CSS so assistive tech still reads the real words. */}
            <h2 id={titleId} className="truncate text-sm font-semibold uppercase tracking-wider text-ink">
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className="mt-0.5 text-2xs uppercase tracking-wider text-ink-faint"
              >
                {description}
              </p>
            )}
          </div>
          {showClose && (
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:text-ink"
            >
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </header>

        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>

        {footer && (
          <footer
            className="shrink-0 border-t p-3"
            style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>,
    portalRoot,
  );
}

export function AlertDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const descId = useId();
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
    } catch {
      // Callers handle/toast their own errors; prevent unhandled rejections.
    } finally {
      setPending(false);
    }
  }

  function requestClose() {
    if (!pending) onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      title={title}
      ariaDescribedBy={descId}
      role="alertdialog"
      variant="center"
      size="sm"
      closeOnBackdrop={false}
      showClose={false}
      initialFocusRef={cancelRef}
      footer={
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn btn-ghost"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="btn border border-over text-over transition-colors hover:bg-over hover:text-panel"
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      }
    >
      <p id={descId} className="text-sm leading-5 text-ink-dim">{description}</p>
    </Dialog>
  );
}
