"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import CrossFade from "./CrossFade";

/**
 * Cross-fades real route changes — dashboard, login, and register are three
 * separate pages with different chrome, so without this the outgoing one
 * just vanishes. Keyed by pathname, not by the tab/date query params: those
 * changes never touch pathname, so this never doubles up with MotionRegion's
 * own tab cross-fade or DayTransition's own date cross-fade in app/page.tsx.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <CrossFade transitionKey={pathname}>{children}</CrossFade>;
}
