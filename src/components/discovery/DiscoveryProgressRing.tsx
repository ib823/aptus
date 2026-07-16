/**
 * ABeam Workbench — Neutral Process Discovery progress ring (brief §6/16).
 *
 * Per-stream review progress. Reviewed streams get a teal ring (brief §6/15);
 * in-progress and untouched get navy.
 *
 * The ring is aria-hidden and the numbers are announced by the segment's own
 * text instead — a screen reader should hear "18 of 61 processes reviewed", not
 * "18/61" twice.
 */

export interface DiscoveryProgressRingProps {
  value: number;
  max: number;
  /** Reviewed streams ring teal per brief §6/15; everything else navy. */
  tone?: "navy" | "standard";
  size?: number;
}

export function DiscoveryProgressRing({
  value,
  max,
  tone = "navy",
  size = 56,
}: DiscoveryProgressRingProps) {
  const r = 25;
  const circumference = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const dash = `${circumference * pct} ${circumference - circumference * pct}`;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 56 56" width={size} height={size}>
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          strokeWidth="6"
          className="stroke-ink-tint"
        />
        {pct > 0 && (
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={dash}
            transform="rotate(-90 28 28)"
            className={tone === "standard" ? "stroke-decision-standard" : "stroke-navy"}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold text-ink-soft">
        {value}/{max}
      </span>
    </div>
  );
}
