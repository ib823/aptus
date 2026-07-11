import type { HubStatus } from "@/lib/sap-public/hub-content";

/**
 * StatusBadge — token-mapped catalogue status (design-token contract §1).
 * A badge asserts only what a probe established: ACTIVATED (200)→signed,
 * NEEDS_SETUP (403)→awaiting, NOT_FOUND (404)/NOT_CHECKED (un-probed)→neutral,
 * AVAILABLE (event, subscribe-only — tenant subscription NOT verified)→sent,
 * REFERENCE→draft. Un-probed is NEVER "Needs setup", and AVAILABLE never claims
 * the item is available IN YOUR TENANT — only that SAP publishes it as
 * subscribe-only. Colour via var(--token) only (zero hex); flips in dark within
 * [data-cap-catalogue].
 */
export type BadgeStatus = HubStatus;

const TONE: Record<BadgeStatus, { bg: string; fg: string; label: string; tip: string }> = {
  ACTIVATED: { bg: "var(--status-signed-bg)", fg: "var(--status-signed-fg)", label: "Activated", tip: "Live $metadata returned 200 for the comm user — reachable/authorized." },
  NEEDS_SETUP: { bg: "var(--status-awaiting-bg)", fg: "var(--status-awaiting-fg)", label: "Needs setup", tip: "Probed 403/401 — published for this edition, but the tenant hasn't authorized the communication arrangement." },
  NOT_FOUND: { bg: "var(--surface-ink-tint)", fg: "var(--ink-muted)", label: "Not found", tip: "Probed 404 — the service path is absent on this tenant." },
  NOT_CHECKED: { bg: "var(--surface-ink-tint)", fg: "var(--ink-secondary)", label: "Not checked", tip: "Probeable (OData) but not probed yet — run Probe-all or open the item. Status unknown, not a negative." },
  NOT_PROBEABLE: { bg: "var(--status-expired-bg)", fg: "var(--status-expired-fg)", label: "Not probeable", tip: "No OData endpoint to check here (SOAP / async / no apiType). A terminal, honest 'can't verify on the tenant from this tool'." },
  AVAILABLE: { bg: "var(--status-sent-bg)", fg: "var(--status-sent-fg)", label: "Available", tip: "Published, subscribe-only (CloudEvents) — tenant subscription NOT verified. Not 'available in your tenant'." },
  REFERENCE: { bg: "var(--status-draft-bg)", fg: "var(--status-draft-fg)", label: "Reference", tip: "Design-time content — not a tenant runtime endpoint." },
};

export function StatusBadge({ status, subscribe }: { status: BadgeStatus; subscribe?: boolean }) {
  const tone = TONE[status];
  return (
    <span
      role="status"
      aria-label={subscribe ? `${tone.label}, subscribe` : tone.label}
      title={tone.tip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 24,
        padding: "0 10px",
        borderRadius: "var(--radius-pill)",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: tone.bg,
        color: tone.fg,
      }}
    >
      {tone.label}
      {subscribe && <span style={{ opacity: 0.75, fontWeight: 500 }}>· subscribe</span>}
    </span>
  );
}
