/**
 * <ProgressRing> — a small, accessible SVG progress ring (server-renderable).
 * Used on the executive value-chain ribbon for per-stream answered/total.
 */

interface Props {
  value: number;
  max: number;
  size?: number;
  label?: string;
}

export function ProgressRing({ value, max, size = 44, label }: Props) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? `${value} of ${max} answered`}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ink-tint, #EDEAE1)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-decision-standard, #2E7D5B)"
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
        fontSize={size * 0.28}
        fill="var(--ink-secondary, #4A4A4A)"
        fontWeight="600"
      >
        {max > 0 ? `${Math.round(pct * 100)}%` : "—"}
      </text>
    </svg>
  );
}
