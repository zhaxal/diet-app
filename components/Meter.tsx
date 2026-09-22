"use client";

import { useEffect, useState } from "react";

export function MeterFill({
  progress,
  over = false,
  color,
}: {
  progress: number;
  over?: boolean;
  color?: string;
}) {
  const boundedProgress = Math.min(100, Math.max(0, progress));
  const [renderedProgress, setRenderedProgress] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRenderedProgress(boundedProgress));
    return () => window.cancelAnimationFrame(frame);
  }, [boundedProgress]);

  return (
    <div
      aria-hidden="true"
      className="motion-meter-fill h-full w-full"
      style={{
        transform: `scaleX(${renderedProgress / 100})`,
        background: color ?? (over ? "var(--over)" : "var(--accent)"),
      }}
    />
  );
}

// Horizontal readout: label, value/goal, and a thin bar. Packs far more per
// screen than a ring and reads left-to-right like an instrument scale.
export function Meter({
  label,
  value,
  goal,
  unit = "g",
  size = "sm",
  bound,
}: {
  label: string;
  value: number;
  goal: number | null;
  unit?: string;
  size?: "sm" | "lg";
  /** Whether the goal is a floor to clear or a ceiling to stay under. Budgets
      leave it unset. The six nutrients are not one kind of thing, and a bar
      that reads the same for all of them turns "95% of your sugar" into an
      achievement. The distinction is typographic on purpose: the system has
      exactly three number colours and this is not allowed to be a fourth. */
  bound?: "min" | "max";
}) {
  const over = goal ? value > goal : false;
  // Past the goal the track re-scales to the value, so the goal becomes a tick
  // inside the bar rather than the end of it. Clamping at 100% drew 165/150
  // and 300/150 as the same full bar — the instrument stopped measuring at
  // exactly the point the measurement got interesting.
  const pct = goal ? (over ? 100 : (value / goal) * 100) : 0;
  const goalTickPct = goal && over ? (goal / value) * 100 : null;
  const shown = Math.round(value * 10) / 10;
  const overBy = goal && over ? Math.round((value - goal) * 10) / 10 : null;
  const lg = size === "lg";

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex min-w-0 flex-col gap-0.5 min-[560px]:flex-row min-[560px]:items-baseline min-[560px]:justify-between min-[560px]:gap-2">
        <span className="text-2xs uppercase tracking-wider text-ink-faint">
          {label}
        </span>
        <span className="num min-w-0 [overflow-wrap:anywhere] text-ink-dim" style={{ fontSize: lg ? 13 : 11 }}>
          <span
            className="font-semibold"
            style={{ color: over ? "var(--over)" : "var(--ink)" }}
          >
            {shown}
          </span>
          {goal ? `/${goal}` : ""}
          <span className="text-ink-faint">{unit}</span>
          {goal && bound ? (
            <span className="text-ink-faint"> {bound}</span>
          ) : null}
          {/* Hue alone carried "over" before this, which is a WCAG 1.4.1
              failure on the app's core content and says nothing about by how
              much. The readout above the bar already prints "left"/"over" for
              calories; the six meters now share its vocabulary. */}
          {overBy !== null ? (
            <span
              className="font-semibold"
              style={{ color: "var(--over)" }}
            >
              {" "}+{overBy} over
            </span>
          ) : null}
        </span>
      </div>
      <div className="h-1 shrink-0" aria-hidden="true" />
      {/* No goal means no rail. An empty track reads as "you have eaten nothing"
          rather than "no target set" — a hairline says unset without lying. */}
      {goal ? (
        <div
          className="relative mt-auto w-full overflow-hidden rounded-sm"
          style={{ height: lg ? 6 : 4, marginTop: "auto", background: "var(--line-soft)" }}
        >
          <MeterFill progress={pct} over={over} />
          {/* Where the goal sits inside an overshooting bar. At 165/150 it
              stands near the end; at 300/150 it stands at the middle. The
              shape differs, not just the colour. */}
          {goalTickPct !== null ? (
            <span
              aria-hidden="true"
              className="absolute top-0 h-full"
              style={{
                left: `${goalTickPct}%`,
                width: 1,
                background: "var(--panel)",
              }}
            />
          ) : null}
        </div>
      ) : (
        <div
          className="mt-auto w-full"
          style={{ height: 1, marginTop: "auto", background: "var(--line)" }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export default Meter;
