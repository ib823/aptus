/**
 * <PayloadView> — compact key/value renderer for an audit event payload
 * (design brief §3.5 / §6.4).
 *
 * Keys render in navy, string values in the standard (teal) decision color,
 * numbers in the custom (amber) color, everything else in ink — a tiny
 * syntax highlight that keeps the audit table scannable without pulling in a
 * JSON formatter. Non-object payloads fall back to a single stringified line.
 */

interface PayloadViewProps {
  payload: unknown;
}

const preStyle = {
  fontFamily: "var(--font-mono), ui-monospace, monospace",
  fontSize: 12,
  lineHeight: 1.5,
  margin: 0,
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  color: "var(--ink-secondary, #4A4A4A)",
};

function valueColor(value: unknown): string {
  if (typeof value === "string") return "var(--decision-standard, #0F766E)";
  if (typeof value === "number") return "var(--decision-custom, #B45309)";
  return "var(--ink-primary, #1A1A1A)";
}

export function PayloadView({ payload }: PayloadViewProps) {
  if (payload === null || payload === undefined) {
    return <span style={{ color: "var(--ink-muted, #8A8A8A)" }}>—</span>;
  }

  if (typeof payload !== "object" || Array.isArray(payload)) {
    return <pre style={preStyle}>{JSON.stringify(payload)}</pre>;
  }

  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length === 0) {
    return <span style={{ color: "var(--ink-muted, #8A8A8A)" }}>—</span>;
  }

  return (
    <pre style={preStyle}>
      {entries.map(([key, value]) => (
        <span key={key}>
          <span style={{ color: "var(--brand-navy, #002B5C)" }}>{key}</span>
          <span style={{ color: "var(--ink-muted, #8A8A8A)" }}>: </span>
          <span style={{ color: valueColor(value) }}>
            {typeof value === "string" ? `"${value}"` : JSON.stringify(value)}
          </span>
          {"\n"}
        </span>
      ))}
    </pre>
  );
}
