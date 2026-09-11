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
  ACTIVATED: { bg: "var(--status-signed-bg)", fg: "var(--status-signed-fg)", label: "Activated", tip: "Live $metadata returned 200 for the comm user: the service is reachable and its metadata may be read. That does NOT prove a data read will succeed — a 403 on the entity set is common when the arrangement lacks the read scope. 'read verified' means a 1-row read returned 200; 'metadata only' means no row has been read yet." },
  NEEDS_SETUP: { bg: "var(--status-awaiting-bg)", fg: "var(--status-awaiting-fg)", label: "Needs setup", tip: "Probed 403/401 — published for this edition, and this tenant refused the call. The code alone does not say WHY: a missing communication arrangement, a credential without the scenario, an expired secret and an IP restriction all answer the same way. Check the arrangement first, then the communication user." },
  NOT_FOUND: { bg: "var(--surface-ink-tint)", fg: "var(--ink-muted)", label: "Not found", tip: "Probed 404 — the service path is absent on this tenant." },
  NOT_CHECKED: { bg: "var(--surface-ink-tint)", fg: "var(--ink-secondary)", label: "Not checked", tip: "Probeable (OData) but not probed yet — run Probe-all or open the item. Status unknown, not a negative." },
  PROBE_FAILED: { bg: "var(--status-expired-bg)", fg: "var(--status-expired-fg)", label: "Probe failed", tip: "A probe ran and could not reach a verdict (5xx, timeout or network failure). Unknown — like 'Not checked', but we DID look, and the tenant or the route is why we still don't know. Re-run it." },
  NOT_PROBEABLE: { bg: "var(--status-expired-bg)", fg: "var(--status-expired-fg)", label: "Not probeable", tip: "No OData endpoint to check here (SOAP / async / no apiType). A terminal, honest 'can't verify on the tenant from this tool'." },
  AVAILABLE: { bg: "var(--status-sent-bg)", fg: "var(--status-sent-fg)", label: "Available", tip: "Published, subscribe-only (CloudEvents) — tenant subscription NOT verified. Not 'available in your tenant'." },
  REFERENCE: { bg: "var(--status-draft-bg)", fg: "var(--status-draft-fg)", label: "Reference", tip: "Design-time content — not a tenant runtime endpoint." },
  // 2608 WS3 — grey-red, tenant-independent: SAP retired it, whatever the tenant says.
  DEPRECATED: { bg: "var(--status-revoked-bg)", fg: "var(--status-revoked-fg)", label: "Deprecated", tip: "Deprecated by SAP — no successor named yet" },
};

/**
 * What ACTIVATED has actually established for a row. "Activated" and
 * "Reachable" both meant one thing — $metadata answered 200 — and neither said
 * whether the communication user may read a row. Bank showed Activated on two
 * real tenants while every data read returned 403, and a developer scoped an
 * integration around the badge. The word stays (it is the vocabulary every
 * surface shares); the qualifier says which half of it is proven.
 */
export type ActivatedEvidence = "read verified" | "metadata only";

export function StatusBadge({
  status,
  subscribe,
  tip,
  evidence,
}: {
  status: BadgeStatus;
  subscribe?: boolean;
  tip?: string | undefined;
  /** Rendered only beside ACTIVATED; ignored for every other status. */
  evidence?: ActivatedEvidence | undefined;
}) {
  const tone = TONE[status];
  const qualifier = subscribe ? "subscribe" : status === "ACTIVATED" && evidence ? evidence : null;
  return (
    <span
      role="status"
      aria-label={qualifier ? `${tone.label}, ${qualifier}` : tone.label}
      title={tip ?? tone.tip}
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
      {qualifier && <span style={{ opacity: 0.75, fontWeight: 500 }}>· {qualifier}</span>}
    </span>
  );
}
