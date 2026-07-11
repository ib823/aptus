/**
 * HttpStatusPill — token-mapped HTTP/connection pill for SAP Operations.
 *
 * One pill, reused by Procurement Operations, Write Mode, and the Entity
 * Explorer so every "200 / HTTP 200 / Live / idle" chip reads the same and
 * on-brand. Colour via var(--token) only (zero hex, no shadcn bg-primary blue):
 *   ok (2xx)      → signed (green)
 *   error (4xx/5xx) → revoked (red)
 *   neutral (idle)  → draft (muted)
 *   live            → signed + a leading dot (mirrors the workbench "connected" chip)
 */
export type HttpTone = "ok" | "error" | "neutral" | "live";

const TONE: Record<HttpTone, { bg: string; fg: string }> = {
  ok: { bg: "var(--status-signed-bg)", fg: "var(--status-signed-fg)" },
  error: { bg: "var(--status-revoked-bg)", fg: "var(--status-revoked-fg)" },
  neutral: { bg: "var(--status-draft-bg)", fg: "var(--status-draft-fg)" },
  live: { bg: "var(--status-signed-bg)", fg: "var(--status-signed-fg)" },
};

/** ok=true → "ok", ok=false → "error", undefined → "neutral" (idle/not run). */
export function httpTone(ok: boolean | undefined): HttpTone {
  if (ok === true) return "ok";
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
