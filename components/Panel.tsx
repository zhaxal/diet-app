"use client";

import React, { useState, useId } from "react";

export function Header({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h1 className="text-sm font-semibold uppercase tracking-widest text-ink">{children}</h1>
      {sub && <span className="num text-2xs text-ink-faint">{sub}</span>}
    </div>
  );
}

// Collapsible bordered section. Controlled when `open`/`onToggle` are supplied.
export function Panel({
  title,
  hint,
  children,
  open,
  onToggle,
  defaultOpen = false,
  bare = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
  bare?: boolean;
}) {
  const [selfOpen, setSelfOpen] = useState(defaultOpen);
  const isOpen = open ?? selfOpen;
  const toggle = onToggle ?? (() => setSelfOpen((s) => !s));
  const bodyId = `panel-${useId()}`;

  return (
    <section className="panel mt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className="motion-press flex min-h-[44px] w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-panel-2"
      >
        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
          {title}
        </span>
        <span className="flex items-center gap-2">
          {hint && <span className="text-2xs text-ink-faint">{hint}</span>}
          <span className="num flex h-5 w-5 items-center justify-center text-xs font-semibold text-ink-faint">
            {isOpen ? "−" : "+"}
          </span>
        </span>
      </button>
      {isOpen && (
        <div
          id={bodyId}
          className={`motion-disclosure-content ${bare ? "" : "border-t px-3 py-2.5"}`}
          style={bare ? undefined : { borderColor: "var(--line)" }}
        >
          {children}
        </div>
      )}
    </section>
  );
}
