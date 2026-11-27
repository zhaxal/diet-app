"use client";

import type { SelectHTMLAttributes } from "react";

/**
 * The system's select. A native `<select>` draws the platform's own arrow —
 * a different metaphor and weight on every OS, and a light one on a near-black
 * field in dark mode. This suppresses it and paints a single masked chevron in
 * `--ink-faint`, at lucide's stroke weight, so the control belongs to the same
 * icon family as the bottom nav. The option list stays the platform's.
 */
export default function Select({
  className = "",
  wrapClassName = "",
  children,
  ref,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  wrapClassName?: string;
  ref?: React.Ref<HTMLSelectElement>;
}) {
  return (
    <span className={`select-wrap ${wrapClassName}`}>
      <select ref={ref} className={`field w-full ${className}`} {...rest}>
        {children}
      </select>
    </span>
  );
}
