"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type DialogSize = "sm" | "md" | "lg" | "xl";
type DialogVariant = "responsive" | "center" | "fullscreen";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
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

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "responsive",
  role = "dialog",
  closeOnBackdrop = true,
  showClose = true,
  initialFocusRef,
  bodyClassName = "p-3 sm:p-4",
}: DialogProps) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => setPortalRoot(getPortalRoot()), []);

  useEffect(() => {
    if (!open || !portalRoot) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== portalRoot)
      .map((node) => ({
        node,
        inert: node.inert,
        ariaHidden: node.getAttribute("aria-hidden"),
      }));

    document.body.style.overflow = "hidden";
    for (const item of background) {
      item.node.inert = true;
      item.node.setAttribute("aria-hidden", "true");
    }

    const frame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? closeRef.current;
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
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      for (const item of background) {
        item.node.inert = item.inert;
        if (item.ariaHidden === null) item.node.removeAttribute("aria-hidden");
        else item.node.setAttribute("aria-hidden", item.ariaHidden);
      }
      previousFocus?.focus();
    };
  }, [initialFocusRef, open, portalRoot]);

  if (!open || !portalRoot) return null;

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
      className={`motion-dialog-scrim fixed inset-0 z-[60] flex ${overlayClass}`}
      onPointerDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`motion-dialog-panel ${variant === "fullscreen" ? "motion-dialog-panel--fullscreen" : ""} flex min-h-0 flex-col overflow-hidden ${panelClass}`}
        style={{
          background: "var(--panel)",
          borderColor: "var(--line)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4"
          style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
        >
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-sm font-semibold tracking-wide text-ink">
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
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
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
      <p className="text-sm leading-5 text-ink-dim">{description}</p>
    </Dialog>
  );
}
