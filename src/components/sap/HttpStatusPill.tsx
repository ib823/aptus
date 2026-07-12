/**
 * HttpStatusPill — token-mapped HTTP/connection pill for SAP Operations.
 *
 * One pill, reused by Procurement Operations, Write Mode, and the Entity
 * Explorer so every "200 / HTTP 200 / Live / idle" chip reads the same and
 * on-brand. Colour via var(--token) only (zero hex, no shadcn bg-primary blue):
 *   ok (2xx, rows)  → signed (green)
 *   empty (2xx, 0 rows) → awaiting (amber) — reachable, but no data on this tenant
 *   error (4xx/5xx) → revoked (red)
 *   neutral (idle)  → draft (muted)
 *   live            → signed + a leading dot (mirrors the workbench "connected" chip)
 */
export type HttpTone = "ok" | "empty" | "error" | "neutral" | "live";

const TONE: Record<HttpTone, { bg: string; fg: string }> = {
  ok: { bg: "var(--status-signed-bg)", fg: "var(--status-signed-fg)" },
  empty: { bg: "var(--status-awaiting-bg)", fg: "var(--status-awaiting-fg)" },
  error: { bg: "var(--status-revoked-bg)", fg: "var(--status-revoked-fg)" },
  neutral: { bg: "var(--status-draft-bg)", fg: "var(--status-draft-fg)" },
  live: { bg: "var(--status-signed-bg)", fg: "var(--status-signed-fg)" },
};

/**
 * ok=true + empty → "empty" (reachable but no rows), ok=true → "ok",
 * ok=false → "error", undefined → "neutral" (idle/not run).
 * Honest signal: a 200 with zero rows is NOT a green "returning data" heartbeat.
 */
export function httpTone(ok: boolean | undefined, empty?: boolean): HttpTone {
  if (ok === true) return empty ? "empty" : "ok";
  if (ok === false) return "error";
  return "neutral";
}

export function HttpStatusPill({ tone, label, dot }: { tone: HttpTone; label: string; dot?: boolean }) {
  const t = TONE[tone];
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 10px",
        borderRadius: "var(--radius-pill)",
        fontSize: 12,
        fontWeight: 600,
        background: t.bg,
        color: t.fg,
        whiteSpace: "nowrap",
      }}
    >
      {(dot || tone === "live") && (
        <span style={{ width: 6, height: 6, borderRadius: 9999, background: "currentColor" }} />
      )}
      {label}
    </span>
  );
}
