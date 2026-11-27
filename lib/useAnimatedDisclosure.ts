import { useEffect, useState, type AnimationEvent } from "react";
import { motionIsAllowed } from "./motion";

/**
 * Every "+ / −" disclosure in the app (Panel, the TDEE calculator, weight
 * history, the MCP/import details toggles) opened with a curtain reveal but
 * closed by vanishing — `{isOpen && <div/>}` unmounts in the same render the
 * toggle flips, with no frame left to play an exit. This mirrors Dialog's
 * open → closing → closed phase machine one level down: stay mounted through
 * the exit animation, then actually unmount.
 */
export function useAnimatedDisclosure(open: boolean, exitDurationMs = 160) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [phase, setPhase] = useState<"closed" | "open" | "closing">(open ? "open" : "closed");

  if (open !== prevOpen) {
    setPrevOpen(open);
    setPhase(
      open
        ? "open"
        : phase === "closed"
          ? "closed"
          : motionIsAllowed()
            ? "closing"
            : "closed",
    );
  }

  // Fallback if the browser drops the animationend event.
  useEffect(() => {
    if (phase !== "closing") return;
    const timeout = window.setTimeout(() => setPhase("closed"), exitDurationMs);
    return () => window.clearTimeout(timeout);
  }, [phase, exitDurationMs]);

  function onAnimationEnd(event: AnimationEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    if (phase === "closing") setPhase("closed");
  }

  return {
    rendered: phase !== "closed",
    closing: phase === "closing",
    onAnimationEnd,
  };
}
