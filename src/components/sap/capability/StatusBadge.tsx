import type { HubStatus } from "@/lib/sap-public/hub-content";

/**
 * StatusBadge — token-mapped catalogue status (design-token contract §1).
 * A badge asserts only what a probe established: ACTIVATED (200)→signed,
 * NEEDS_SETUP (403)→awaiting, NOT_FOUND (404)/NOT_CHECKED (un-probed)→neutral,
 * AVAILABLE (event, subscribe)→sent, REFERENCE→draft. Un-probed is NEVER
 * "Needs setup". Colour via var(--token) only (zero hex); flips in dark within
 * [data-cap-catalogue].
 */
export type BadgeStatus = HubStatus;

const TONE: Record<BadgeStatus, { bg: string; fg: string; label: string }> = {
  ACTIVATED: { bg: "var(--status-signed-bg)", fg: "var(--status-signed-fg)", label: "Activated" },
  NEEDS_SETUP: { bg: "var(--status-awaiting-bg)", fg: "var(--status-awaiting-fg)", label: "Needs setup" },
  NOT_FOUND: { bg: "var(--surface-ink-tint)", fg: "var(--ink-muted)", label: "Not found" },
  NOT_CHECKED: { bg: "var(--surface-ink-tint)", fg: "var(--ink-secondary)", label: "Not checked" },
  AVAILABLE: { bg: "var(--status-sent-bg)", fg: "var(--status-sent-fg)", label: "Available" },
  REFERENCE: { bg: "var(--status-draft-bg)", fg: "var(--status-draft-fg)", label: "Reference" },
};

export function StatusBadge({ status, subscribe }: { status: BadgeStatus; subscribe?: boolean }) {
  const tone = TONE[status];
  return (
    <span
      role="status"
      aria-label={subscribe ? `${tone.label}, subscribe` : tone.label}
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
