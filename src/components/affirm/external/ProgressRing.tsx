/**
 * <ProgressRing> — the per-stream ring on the S4 value-chain ribbon. Token-only
 * (SVG stroke via var(); the animated dash is the one permitted dynamic value).
 * Accessible label. The process/affirm screens use tri-color bars, not rings.
 */

interface Props {
  value: number;
  max: number;
  size?: number;
  /** Progress stroke color: complete streams go green, others navy. */
  color?: "standard" | "navy";
  label?: string;
}

export function ProgressRing({ value, max, size = 56, color = "navy", label }: Props) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const strokeVar = color === "standard" ? "var(--color-decision-standard)" : "var(--color-navy)";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? `${value} of ${max}`}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-ink-tint)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={strokeVar}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-mono"
        fontSize={size * 0.2}
        fontWeight="600"
        fill="var(--color-ink-soft)"
      >
        {max > 0 ? `${value}/${max}` : "—"}
      </text>
    </svg>
  );
}
