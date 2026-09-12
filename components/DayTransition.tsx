"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from "react";

interface Transition {
  id: number;
  transitionKey: string;
  outgoing: ReactNode;
}

function motionIsAllowed() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

/**
 * A narrow cross-fade for a changing daily reading. It keeps surrounding date
 * controls still, while normal interactions inside the reading stay live.
 */
export default function DayTransition({
  transitionKey,
  children,
}: {
  transitionKey: string;
  children: ReactNode;
}) {
  const nextId = useRef(1);
  const previous = useRef({ transitionKey, content: children });
  const [displayedKey, setDisplayedKey] = useState(transitionKey);
  const [transition, setTransition] = useState<Transition | null>(null);
  const keyChanged = displayedKey !== transitionKey;

  // Capture the prior committed reading before paint. The current children are
  // always rendered directly, so opening controls or typing inside a day never
  // waits for a transition-state update.
  useLayoutEffect(() => {
    const prior = previous.current;
    if (prior.transitionKey !== transitionKey) {
      if (motionIsAllowed()) {
        setTransition({
          id: nextId.current++,
          transitionKey,
          outgoing: prior.content,
        });
      } else {
        setTransition(null);
      }
      setDisplayedKey(transitionKey);
    }
    previous.current = { transitionKey, content: children };
  }, [children, transitionKey]);

  const isEntering = keyChanged || transition?.transitionKey === transitionKey;

  // If a browser interrupts the CSS animation, do not leave a hidden reading
  // mounted underneath the selected day.
  useEffect(() => {
    if (!transition) return;
    const timeout = window.setTimeout(() => {
      setTransition((current) => current?.id === transition.id ? null : current);
    }, 190);
    return () => window.clearTimeout(timeout);
  }, [transition]);

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !transition) return;
    setTransition((current) => current?.id === transition.id ? null : current);
  }

  return (
    <div className="motion-day-transition">
      {transition?.transitionKey === transitionKey && (
        <div
          aria-hidden="true"
          className="motion-day-transition__layer motion-day-transition__layer--leaving"
        >
          {transition.outgoing}
        </div>
      )}
      <div
        key={transitionKey}
        className={`motion-day-transition__layer motion-day-transition__layer--${isEntering ? "entering" : "current"}`}
        onAnimationEnd={isEntering ? handleAnimationEnd : undefined}
      >
        {children}
      </div>
    </div>
  );
}
