"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from "react";

function motionIsAllowed() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches
  );
}

interface Snapshot {
  id: number;
  /** The transition key that was active *before* this transition started. */
  fromKey: string;
  content: ReactNode;
  direction: "left" | "right";
}

/**
 * A directional cross-fade for day-to-day navigation. When the date key changes,
 * the outgoing reading slides out and the incoming one slides in from the
 * direction the calendar moved — forward (right to left) or backward (left to
 * right). The date string is extracted from the transitionKey to determine
 * direction; if dates are equal but the surface state changed (loading → ready),
 * a plain opacity fade is used instead.
 *
 * Spatial movement is restricted to a short horizontal translate (16px) — enough
 * to convey direction without making the user wait for content to arrive.
 *
 * No transforms on the container: position-fixed descendants (bottom nav) stay
 * pinned to the viewport because only the layer divs move.
 */
export default function DayTransition({
  transitionKey,
  children,
}: {
  transitionKey: string;
  children: ReactNode;
}) {
  const nextId = useRef(1);
  const prev = useRef({ transitionKey, content: children });
  const [displayedKey, setDisplayedKey] = useState(transitionKey);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useLayoutEffect(() => {
    const prior = prev.current;
    if (prior.transitionKey !== transitionKey) {
      if (motionIsAllowed()) {
        // Extract dates from "YYYY-MM-DD:state" or "prefix:YYYY-MM-DD" formats.
        const priorDate = prior.transitionKey.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
        const nextDate = transitionKey.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";

        // If the date itself changed, slide directionally. If only the surface
        // state changed (loading→ready on the same day), fall back to a plain
        // opacity cross-fade by using "right" as a default.
        let direction: "left" | "right" = "right";
        if (priorDate && nextDate && priorDate !== nextDate) {
          direction = nextDate > priorDate ? "left" : "right";
        }

        setSnapshot({
          id: nextId.current++,
          fromKey: prior.transitionKey,
          content: prior.content,
          direction,
        });
      } else {
        setSnapshot(null);
      }
      setDisplayedKey(transitionKey);
    }
    prev.current = { transitionKey, content: children };
  }, [children, transitionKey]);

  const isEntering = displayedKey !== transitionKey || snapshot != null;

  // Determine whether the date itself changed (directional slide) or just the
  // surface state on the same date (plain opacity fade).
  const fromDate = snapshot?.fromKey.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  const toDate = transitionKey.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  const isDateSwitch = fromDate !== toDate && fromDate !== "" && toDate !== "";
  const direction = snapshot?.direction ?? "right";

  // Safety timeout: if animationend never fires, clean up the leaving layer.
  useEffect(() => {
    if (!snapshot) return;
    const id = snapshot.id;
    const timeout = window.setTimeout(() => {
      setSnapshot((cur) => (cur?.id === id ? null : cur));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [snapshot]);

  function handleAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || !snapshot) return;
    setSnapshot((cur) => (cur?.id === snapshot.id ? null : cur));
  }

  // Pick the correct CSS class for the entering layer.
  const enterClass = !isEntering
    ? "motion-day-layer--current"
    : isDateSwitch
      ? `motion-day-layer--entering-${direction}`
      : "motion-day-layer--entering-fade";

  const leaveClass = isDateSwitch
    ? `motion-day-layer--leaving-${direction}`
    : "motion-day-layer--leaving-fade";

  return (
    <div className="motion-day-slide">
      {snapshot != null && (
        <div
          aria-hidden="true"
          className={`motion-day-layer ${leaveClass}`}
        >
          {snapshot.content}
        </div>
      )}
      <div
        key={transitionKey}
        className={`motion-day-layer ${enterClass}`}
        onAnimationEnd={isEntering ? handleAnimationEnd : undefined}
      >
        {children}
      </div>
    </div>
  );
}
