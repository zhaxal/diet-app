"use client";

// Horizontal readout: label, value/goal, and a thin bar. Packs far more per
// screen than a ring and reads left-to-right like an instrument scale.
export function Meter({
  label,
  value,
  goal,
  unit = "g",
  size = "sm",
}: {
  label: string;
  value: number;
  goal: number | null;
  unit?: string;
  size?: "sm" | "lg";
}) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal ? value > goal : false;
  const shown = Math.round(value * 10) / 10;
  const lg = size === "lg";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs uppercase tracking-wider text-ink-faint">
          {label}
        </span>
        <span className="num text-ink-dim" style={{ fontSize: lg ? 13 : 11 }}>
          <span
            className="font-semibold"
            style={{ color: over ? "var(--over)" : "var(--ink)" }}
          >
            {shown}
          </span>
          {goal ? `/${goal}` : ""}
          <span className="text-ink-faint">{unit}</span>
        </span>
      </div>
      <div
        className="mt-1 w-full overflow-hidden rounded-sm"
        style={{ height: lg ? 6 : 4, background: "var(--line-soft)" }}
      >
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{
            width: `${goal ? pct : 0}%`,
            background: over ? "var(--over)" : "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}

export default Meter;
