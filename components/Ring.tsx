"use client";

import { ReactNode } from "react";

interface RingProps {
  value: number;
  goal?: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  trackClass?: string;
  children?: ReactNode;
}

/**
 * Circular progress ring. If `goal` is set, the arc fills to value/goal
 * (capped at 100%, turns the arc over-color when exceeded). Without a goal
 * it shows a full faint track with no progress arc.
 */
export function Ring({
  value,
  goal,
  size = 160,
  stroke = 14,
  color = "#10b981",
  trackClass = "text-slate-200 dark:text-white/10",
  children,
}: RingProps) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = goal && goal > 0 ? Math.min(value / goal, 1) : 0;
  const over = goal ? value > goal : false;
  const dash = circ * pct;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={trackClass}
          stroke="currentColor"
        />
        {goal ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            stroke={over ? "#f43f5e" : color}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.3s ease" }}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
