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
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches
  );
}

/**
 * The shared cross-fade behind a changing day's reading, a route change, and
 * the loading-to-ready handoff on first load. Whichever content is entering
 * sizes the container in normal flow; the leaving content is lifted out with
 * `position: absolute` so it overlaps on top instead of sharing a track with
 * it — a grid-stack sized to the taller of the two snaps to the survivor's
 * height the instant the leaving one unmounts, which reads as the
 * transition itself being jittery.
 *
 * Opacity only, deliberately: a transformed ancestor would create a new
 * containing block and drag any `position: fixed` descendant (the bottom
 * nav, most often) along with the animation instead of leaving it pinned to
 * the viewport.
 */
export default function CrossFade({
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

  // Capture the prior committed content before paint. The current children
  // are always rendered directly, so interacting inside the current content
  // never waits for a transition-state update.
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

  // If a browser interrupts the CSS animation, do not leave a hidden layer
  // mounted underneath the current one.
  useEffect(() => {
    if (!transition) return;
    const timeout = window.setTimeout(() => {
      setTransition((current) => (current?.id === transition.id ? null : current));
    }, 190);
    return () => window.clearTimeout(timeout);
  }, [transition]);

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !transition) return;
    setTransition((current) => (current?.id === transition.id ? null : current));
  }

  return (
    <div className="motion-cross-fade">
      {transition?.transitionKey === transitionKey && (
        <div
          aria-hidden="true"
          className="motion-cross-fade__layer motion-cross-fade__layer--leaving"
        >
          {transition.outgoing}
        </div>
      )}
      <div
        key={transitionKey}
        className={`motion-cross-fade__layer motion-cross-fade__layer--${isEntering ? "entering" : "current"}`}
        onAnimationEnd={isEntering ? handleAnimationEnd : undefined}
      >
        {children}
      </div>
    </div>
  );
}
