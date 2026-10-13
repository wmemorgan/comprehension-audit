import React from "react";

interface RadarChartProps {
  dimensions: Record<string, number>;
  dimensionLabels: Record<string, string>;
  strongest: string;
  weakest: string;
  primaryColor?: string;
  weakestColor?: string;
}

const DIMENSION_WEIGHTS: Record<string, number> = {
  clarity_of_purpose: 0.20,
  boundary_definition: 0.10,
  tradeoff_articulation: 0.20,
  architectural_intentionality: 0.10,
  failure_mode_awareness: 0.15,
  blast_radius_articulation: 0.10,
  reflection_depth: 0.10,
  ai_override_evidence: 0.05,
};

const DIMENSION_ORDER = [
  "clarity_of_purpose",
  "tradeoff_articulation",
  "failure_mode_awareness",
  "blast_radius_articulation",
  "ai_override_evidence",
  "reflection_depth",
  "architectural_intentionality",
  "boundary_definition",
];

const CX = 200;
const CY = 200;
const R = 140;

function polarToCartesian(angle: number, radius: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad),
    y: CY + radius * Math.sin(rad),
  };
}

export default function RadarChart({
  dimensions,
  dimensionLabels,
  strongest,
  weakest,
  primaryColor = "#F59E0B",
  weakestColor = "#38BDF8",
}: RadarChartProps) {
  const keys = DIMENSION_ORDER.filter((k) => k in dimensions);
  const count = keys.length;
  const angleStep = 360 / count;

  const normalized: Record<string, number> = {};
  keys.forEach((key) => {
    const weight = DIMENSION_WEIGHTS[key] ?? 0.1;
    normalized[key] = Math.min(1, (dimensions[key] ?? 0) / weight);
  });

  const polygonPoints = keys
    .map((key, i) => {
      const angle = i * angleStep;
      const r = normalized[key] * R;
      const pt = polarToCartesian(angle, r);
      return `${pt.x},${pt.y}`;
    })
    .join(" ");

  const rings = [0.25, 0.5, 0.75, 1.0];
  const labelOffset = R + 30;

  return (
    <svg
      viewBox="-80 -20 560 440"
      aria-label="Comprehension dimension radar chart"
      role="img"
      width="100%"
      overflow="visible"
      style={{ display: "block" }}
    >
      {rings.map((pct) => {
        const ringPoints = keys
          .map((_, i) => {
            const angle = i * angleStep;
            const pt = polarToCartesian(angle, pct * R);
            return `${pt.x},${pt.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={pct}
            points={ringPoints}
            fill="none"
            stroke="rgba(148,163,184,0.12)"
            strokeWidth="1"
          />
        );
      })}

      {keys.map((_, i) => {
        const angle = i * angleStep;
        const outer = polarToCartesian(angle, R);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={outer.x}
            y2={outer.y}
            stroke="rgba(148,163,184,0.10)"
            strokeWidth="1"
          />
        );
      })}

      <polygon
        points={polygonPoints}
        fill={`${primaryColor}26`}
        stroke={primaryColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {keys.map((key, i) => {
        const angle = i * angleStep;
        const r = normalized[key] * R;
        const pt = polarToCartesian(angle, r);

        const isStrongest = key === strongest;
        const isWeakest = key === weakest;

        const fill = isStrongest ? primaryColor : isWeakest ? weakestColor : primaryColor;
        const radius = isStrongest || isWeakest ? 5 : 3;

        return (
          <circle
            key={key}
            cx={pt.x}
            cy={pt.y}
            r={radius}
            fill={fill}
            stroke={isStrongest || isWeakest ? "rgba(15,23,42,0.8)" : "none"}
            strokeWidth="1"
          />
        );
      })}

      {keys.map((key, i) => {
        const angle = i * angleStep;
        const pt = polarToCartesian(angle, labelOffset);
        const dx = pt.x - CX;
        const textAnchor = Math.abs(dx) < 12 ? "middle" : dx > 0 ? "start" : "end";

        const label = dimensionLabels[key] ?? key;
        const words = label.split(" ");
        let line1 = "";
        let line2 = "";
        if (label.length > 14 && words.length > 1) {
          const mid = Math.ceil(words.length / 2);
          line1 = words.slice(0, mid).join(" ");
          line2 = words.slice(mid).join(" ");
        } else {
          line1 = label;
        }

        return (
          <text
            key={key}
            x={pt.x}
            y={pt.y}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            fontSize="14"
            fontWeight="600"
            fontFamily="system-ui, sans-serif"
            fill="#E2E8F0"
            letterSpacing="0.01em"
          >
            {line2 ? (
              <>
                <tspan x={pt.x} dy="-0.6em">{line1}</tspan>
                <tspan x={pt.x} dy="1.2em">{line2}</tspan>
              </>
            ) : (
              line1
            )}
          </text>
        );
      })}

      {[0.5, 1.0].map((pct) => (
        <text
          key={pct}
          x={CX + 4}
          y={CY - pct * R + 3}
          fontSize="11"
          fontFamily="Consolas, monospace"
          fill="rgba(148,163,184,0.55)"
        >
          {Math.round(pct * 100)}%
        </text>
      ))}
    </svg>
  );
}
