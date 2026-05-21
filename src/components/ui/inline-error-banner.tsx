/**
 * InlineErrorBanner — form-level / route-level error display (brief §2.4).
 *
 * Two-line layout: human message + machine-readable code (for support
 * triage). Warm-red bg (cta-focus tint) with a 4-px CTA red left
 * border-l and an AlertTriangle icon. role=alert so screen readers
 * announce immediately when injected.
 *
 * Replaces the ad-hoc inline error block that BundleCreateForm
 * previously rendered for NO_SIGNATORY / RECIPIENT_DOMAIN_BLOCKED.
 */

import { AlertTriangle } from 'lucide-react';

interface Props {
  message: string;
  /** Machine-readable error code (e.g., "NO_SIGNATORY"). Rendered in
   * mono for grep-ability when end users paste into support tickets. */
  code?: string;
}

export function InlineErrorBanner({ message, code }: Props) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        borderRadius: 12,
        borderLeft: '4px solid var(--cta-red)',
        background: 'var(--cta-red-focus)',
        padding: 16,
        marginBottom: 24,
      }}
    >
      <AlertTriangle
        size={18}
        aria-hidden
        style={{ marginTop: 2, color: 'var(--cta-red)', flexShrink: 0 }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#7F1D1D',
            lineHeight: 1.4,
          }}
        >
          {message}
        </div>
        {code ? (
          <div
            style={{
              marginTop: 2,
              fontSize: 12,
              color: 'var(--ink-muted)',
              fontFamily:
                'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
            }}
          >
            {code}
          </div>
        ) : null}
      </div>
    </div>
  );
}
