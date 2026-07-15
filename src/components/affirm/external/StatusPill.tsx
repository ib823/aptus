/**
 * <StatusPill> — the uppercase status pill used across the executive surface
 * (ribbon, story cards, S9 table). Token-only: the decision tones use the
 * permitted color-mix alpha steps of the decision colors; the S9 lifecycle
 * tones map to the repo's status-* tokens (never re-hardcoded hex, per §2.4).
 */

export type PillTone =
  | "neutral"
  | "navy"
  | "standard"
  | "configure"
  | "custom"
  // S9 lifecycle tones → repo status-* tokens
  | "invited"
  | "acknowledged"
  | "verified"
  | "progress"
  | "submitted"
  | "revoked";

const TONES: Record<PillTone, string> = {
  neutral: "bg-ink-tint text-ink-muted",
  navy: "bg-navy-soft text-navy",
  standard:
    "bg-[color-mix(in_srgb,var(--color-decision-standard)_15%,transparent)] text-decision-standard",
  configure:
    "bg-[color-mix(in_srgb,var(--color-decision-configure)_15%,transparent)] text-decision-configure",
  custom:
    "bg-[color-mix(in_srgb,var(--color-decision-custom)_15%,transparent)] text-decision-custom",
  invited: "bg-status-draft-bg text-status-draft-fg",
  acknowledged: "bg-status-sent-bg text-status-sent-fg",
  verified: "bg-status-awaiting-bg text-status-awaiting-fg",
  progress: "bg-navy-soft text-navy",
  submitted: "bg-status-signed-bg text-status-signed-fg",
  revoked: "bg-status-revoked-bg text-status-revoked-fg",
};

export function StatusPill({
  tone,
  children,
  mono = false,
}: {
  tone: PillTone;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-[22px] items-center rounded-pill px-2 text-[10px] font-bold uppercase tracking-[0.06em] ${
        mono ? "font-mono" : ""
      } ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
