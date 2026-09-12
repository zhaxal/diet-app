"use client";

import type { CSSProperties } from "react";

/*
 * Both charts stretch to their container with `preserveAspectRatio="none"`, so
 * only two kinds of mark survive intact: a rect, and a stroke carrying
 * `vector-effect="non-scaling-stroke"`. Anything else is scaled non-uniformly —
 * which is why the bars no longer carry a corner radius (a 1-unit radius became
 * ~6px wide and 1px tall) and why the line's points are drawn as zero-length
 * round-capped strokes rather than circles, which rendered as flat ellipses.
 *
 * Stretching needs both axes given. With `w-full` alone the browser took the
 * height from the viewBox's own 100:80 ratio — about 350px inside a 112px
 * `overflow-hidden` frame — so the chart was cropped to its top third and only
 * bars close to the maximum were visible at all. Every other day rendered
 * below the fold of its own panel. `h-full` is what makes the viewBox map onto
 * the frame the caller actually drew.
 */

interface BarChartProps {
  data: { label: string; value: number }[];
  ariaLabel: string;
  color?: string;
  height?: number;
  /** Draws a hairline at this value, so the bars read against a target. */
  reference?: number | null;
  /** Bars past `reference` take this colour. */
  overColor?: string;
}

export function BarChart({
  data,
  ariaLabel,
  color = "var(--accent)",
  height = 80,
  reference = null,
  overColor = "var(--over)",
}: BarChartProps) {
  if (data.length === 0) return null;
  // The reference line has to fit too, or a day under a goal it never reaches
  // would push the goal off the top of the frame.
  const max = Math.max(...data.map((d) => d.value), reference ?? 0, 1);
  const w = 100 / data.length;
  const refY = reference ? height - (reference / max) * (height - 4) : null;

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      className="block h-full w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <title>{ariaLabel}</title>
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - 4);
        const over = reference != null && d.value > reference;
        return (
          <rect
            key={i}
            className="motion-chart-bar"
            style={{ "--bar-index": i } as CSSProperties}
            x={i * w + w * 0.1}
            y={height - barH}
            width={w * 0.8}
            height={barH}
            fill={over ? overColor : color}
            opacity={0.85}
          />
        );
      })}
      {refY != null && (
        <line
          className="motion-chart-ref-line"
          x1={0}
          y1={refY}
          x2={100}
          y2={refY}
          stroke="var(--ink-faint)"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

interface LineChartProps {
  data: { value: number }[];
  ariaLabel: string;
  color?: string;
  height?: number;
}

export function LineChart({ data, ariaLabel, color = "var(--accent)", height = 80 }: LineChartProps) {
  if (data.length < 2) return null;
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pad = 4;
  const innerH = height - pad * 2;
  const step = 100 / (data.length - 1);
  const at = (i: number, v: number) => ({
    x: i * step,
    y: pad + innerH - ((v - min) / range) * innerH,
  });

  const points = data.map((d, i) => { const p = at(i, d.value); return `${p.x},${p.y}`; }).join(" ");

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      className="motion-chart-line block h-full w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <title>{ariaLabel}</title>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {data.map((d, i) => {
        const p = at(i, d.value);
        // A zero-length stroke with a round cap is a true circle of the stroke's
        // width, and non-scaling-stroke keeps it round under the stretch.
        return (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={p.x}
            y2={p.y}
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
