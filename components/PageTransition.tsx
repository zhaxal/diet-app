"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

interface Transition {
  id: number;
  pathname: string;
  outgoing: ReactNode;
}

function motionIsAllowed() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

/**
 * Cross-fades real route changes — dashboard, login, and register are three
 * separate pages with different chrome, so without this the outgoing one
 * just vanishes. Mirrors DayTransition's grid-stack technique one level up,
 * keyed by pathname instead of a selected day. Query-param changes (the tab
 * switch on `/`) do not touch pathname, so this never doubles up with
 * MotionRegion's own tab cross-fade in app/page.tsx.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const nextId = useRef(1);
  const previous = useRef({ pathname, content: children });
  const [displayedPath, setDisplayedPath] = useState(pathname);
  const [transition, setTransition] = useState<Transition | null>(null);
  const pathChanged = displayedPath !== pathname;

  useLayoutEffect(() => {
    const prior = previous.current;
    if (prior.pathname !== pathname) {
      if (motionIsAllowed()) {
        setTransition({
          id: nextId.current++,
          pathname,
          outgoing: prior.content,
        });
      } else {
        setTransition(null);
      }
      setDisplayedPath(pathname);
    }
    previous.current = { pathname, content: children };
  }, [children, pathname]);

  const isEntering = pathChanged || transition?.pathname === pathname;

  // If a browser interrupts the CSS animation, do not leave the previous
  // page mounted underneath the current route.
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
    <div className="motion-page-transition">
      {transition?.pathname === pathname && (
        <div
          aria-hidden="true"
          className="motion-page-transition__layer motion-page-transition__layer--leaving"
        >
          {transition.outgoing}
        </div>
      )}
      <div
        key={pathname}
        className={`motion-page-transition__layer motion-page-transition__layer--${isEntering ? "entering" : "current"}`}
        onAnimationEnd={isEntering ? handleAnimationEnd : undefined}
      >
        {children}
      </div>
    </div>
  );
}
