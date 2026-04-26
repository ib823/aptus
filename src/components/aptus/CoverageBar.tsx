/**
 * CoverageBar — at-a-glance OOTB / Configure / Gap split.
 * Source: docs/design/v1.2/components.jsx (the prototype).
 *
 * Three render variants:
 *   - "stacked" (default): a single horizontal bar with proportional segments
 *   - "donut":  a small SVG donut chart (80×80) + inline legend
 *   - "numbers": three big numbers + small labels, no chart
 *
 * Used on Dashboard, Assessments list, Assessment shell header, and Step 4.
 */

interface CoverageBarProps {
  /** Out-of-the-box / FIT count or percentage. */
  ootb?: number;
  /** Configurable count or percentage. */
  config?: number;
  /** Gap (needs work) count or percentage. */
  gap?: number;
  /** Render variant. Defaults to "stacked". */
  variant?: "stacked" | "donut" | "numbers";
  /** Show legend below/beside the bar. */
  showLabels?: boolean;
  /** "thin" reduces bar height to 6 px (for use in dense table rows). */
  height?: "thin" | number;
}

export function CoverageBar({
  ootb = 0,
  config = 0,
  gap = 0,
  variant = "stacked",
  showLabels = true,
  height,
}: CoverageBarProps) {
  const total = ootb + config + gap || 1;

  if (variant === "donut") {
    const r = 28;
    const c = 2 * Math.PI * r;
    const strokeWidth = 8;
    const segs = [
      { v: ootb, c: "var(--aptus-success-500)" },
      { v: config, c: "var(--aptus-warning-500)" },
      { v: gap, c: "var(--aptus-danger-500)" },
    ];
    let offset = 0;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width={80} height={80} viewBox="-40 -40 80 80" style={{ transform: "rotate(-90deg)" }} aria-hidden>
          <circle cx="0" cy="0" r={r} fill="none" stroke="var(--aptus-surface-2)" strokeWidth={strokeWidth} />
          {segs.map((s, i) => {
            const len = (s.v / total) * c;
            const dasharray = `${len} ${c - len}`;
            const el = (
              <circle
                key={i}
                cx="0"
                cy="0"
                r={r}
                fill="none"
                stroke={s.c}
                strokeWidth={strokeWidth}
                strokeDasharray={dasharray}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        {showLabels && <CoverageLegend ootb={ootb} config={config} gap={gap} />}
      </div>
    );
  }

  if (variant === "numbers") {
    return (
      <div style={{ display: "flex", gap: 16 }}>
        <NumStat label="OOTB" value={`${ootb}%`} color="var(--aptus-success-700)" />
        <NumStat label="Config" value={`${config}%`} color="var(--aptus-warning-700)" />
        <NumStat label="Gap" value={`${gap}%`} color="var(--aptus-danger-700)" />
      </div>
    );
  }

  // default: "stacked"
  const heightStyle =
    typeof height === "number"
      ? { height }
      : height === "thin"
        ? {}
        : {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <div
        className={`a-coverage-bar ${height === "thin" ? "a-coverage-bar-thin" : ""}`}
        style={heightStyle}
      >
        <div className="a-coverage-seg a-ootb" style={{ width: `${(ootb / total) * 100}%` }} />
        <div className="a-coverage-seg a-config" style={{ width: `${(config / total) * 100}%` }} />
        <div className="a-coverage-seg a-gap" style={{ width: `${(gap / total) * 100}%` }} />
      </div>
      {showLabels && <CoverageLegend ootb={ootb} config={config} gap={gap} inline />}
    </div>
  );
}

interface NumStatProps {
  label: string;
  value: string;
  color: string;
}

export function NumStat({ label, value, color }: NumStatProps) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1.1 }}>{value}</div>
      <div className="a-small">{label}</div>
    </div>
  );
}

interface CoverageLegendProps {
  ootb: number;
  config: number;
  gap: number;
  inline?: boolean;
}

export function CoverageLegend({ ootb, config, gap }: CoverageLegendProps) {
  return (
    <div className="a-small" style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Dot c="var(--aptus-success-500)" /> {ootb}% OOTB
      <Dot c="var(--aptus-warning-500)" /> {config}% Config
      <Dot c="var(--aptus-danger-500)" /> {gap}% Gap
    </div>
  );
}

export function Dot({ c }: { c: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: c,
        display: "inline-block",
        marginRight: 4,
      }}
    />
  );
}
