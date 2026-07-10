/**
 * StatusBadge — token-mapped catalogue status (design-token contract §1).
 * ACTIVATED→signed, AVAILABLE→sent, REFERENCE→draft, NEEDS_SETUP→awaiting.
 * Colour via var(--token) only (zero hex); flips in dark within [data-cap-catalogue].
 */
export type BadgeStatus = "ACTIVATED" | "AVAILABLE" | "REFERENCE" | "NEEDS_SETUP";

const TONE: Record<BadgeStatus, { bg: string; fg: string; label: string }> = {
  ACTIVATED: { bg: "var(--status-signed-bg)", fg: "var(--status-signed-fg)", label: "Activated" },
  AVAILABLE: { bg: "var(--status-sent-bg)", fg: "var(--status-sent-fg)", label: "Available" },
  REFERENCE: { bg: "var(--status-draft-bg)", fg: "var(--status-draft-fg)", label: "Reference" },
  NEEDS_SETUP: { bg: "var(--status-awaiting-bg)", fg: "var(--status-awaiting-fg)", label: "Needs setup" },
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
