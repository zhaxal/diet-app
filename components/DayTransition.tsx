"use client";

import type { ReactNode } from "react";
import CrossFade from "./CrossFade";

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
  return <CrossFade transitionKey={transitionKey}>{children}</CrossFade>;
}
