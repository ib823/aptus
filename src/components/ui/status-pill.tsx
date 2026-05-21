/**
 * StatusPill — presales bundle / grant status (brief §2.2).
 *
 * Tinted-bg + saturated-text taxonomy from §1.1 tokens. Distinct from
 * the Aptus status pill (src/components/aptus/StatusPill.tsx) — that
 * one carries fit/configure/extend/build/adapt semantics for the
 * assessment domain. This pill is for presales lifecycle states.
 *
 * Renders an inline-flex pill with aria-label matching the visible
 * label so screen readers announce a meaningful string.
 */

type Status =
  | 'draft'
  | 'sent'
  | 'awaiting_signoff'
  | 'signed'
  | 'expired'
  | 'revoked'
  | 'superseded';

const styles: Record<Status, { bg: string; fg: string }> = {
  draft: { bg: 'var(--status-draft-bg)', fg: 'var(--status-draft-fg)' },
  sent: { bg: 'var(--status-sent-bg)', fg: 'var(--status-sent-fg)' },
  awaiting_signoff: { bg: 'var(--status-awaiting-bg)', fg: 'var(--status-awaiting-fg)' },
  signed: { bg: 'var(--status-signed-bg)', fg: 'var(--status-signed-fg)' },
  expired: { bg: 'var(--status-expired-bg)', fg: 'var(--status-expired-fg)' },
  revoked: { bg: 'var(--status-revoked-bg)', fg: 'var(--status-revoked-fg)' },
  superseded: { bg: 'var(--status-expired-bg)', fg: 'var(--status-expired-fg)' },
};

const labels: Record<Status, string> = {
  draft: 'Draft',
  sent: 'Sent',
  awaiting_signoff: 'Awaiting signoff',
  signed: 'Signed',
  expired: 'Expired',
  revoked: 'Revoked',
  superseded: 'Superseded',
};

interface Props {
  status: Status;
  /** Override the default label (rare — only when business copy differs). */
  label?: string;
}

export function StatusPill({ status, label }: Props) {
  const tone = styles[status];
  const text = label ?? labels[status];
  return (
    <span
      role="status"
      aria-label={text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 28,
        padding: '0 12px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        background: tone.bg,
        color: tone.fg,
        whiteSpace: 'nowrap',
        letterSpacing: 0.1,
      }}
    >
      {text}
    </span>
  );
}

export type PresalesStatus = Status;
