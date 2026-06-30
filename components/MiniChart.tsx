"use client";

interface BarChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}

export function BarChart({ data, color = "#10b981", height = 80 }: BarChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 100 / data.length;

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none">
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - 4);
        return (
          <rect
            key={i}
            x={i * w + w * 0.1}
            y={height - barH}
            width={w * 0.8}
            height={barH}
            fill={color}
            opacity={0.8}
            rx={1}
          />
        );
      })}
    </svg>
  );
}

interface LineChartProps {
  data: { value: number }[];
  color?: string;
  height?: number;
}

export function LineChart({ data, color = "#10b981", height = 80 }: LineChartProps) {
  if (data.length < 2) return null;
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pad = 4;
  const innerH = height - pad * 2;
  const step = 100 / (data.length - 1);

  const points = data
    .map((d, i) => {
      const x = i * step;
      const y = pad + innerH - ((d.value - min) / range) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none">
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
        const x = i * step;
        const y = pad + innerH - ((d.value - min) / range) * innerH;
        return <circle key={i} cx={x} cy={y} r={2.5} fill={color} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}
