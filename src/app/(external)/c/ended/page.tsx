/**
 * GET /c/ended — terminal confirmation page after logout.
 *
 * Pure static. Requires no cookie, no session, no DB. The /c/* headers in
 * next.config.ts still apply (Cache-Control: no-store, Referrer-Policy:
 * no-referrer) which is intentional — we don't want the rendered HTML
 * cached by intermediaries even though it carries no sensitive data.
 *
 * Visuals match the /c/expired card (brief §3.9): cream surface,
 * centered wordmark, cream-on-paper card with serif heading.
 */

import { Wordmark } from '@/components/brand/Wordmark';

export default function PresalesEndedPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--surface-cream)',
        padding: '48px 16px',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Wordmark size="md" />
        </div>

        <main
          style={{
            background: 'var(--surface-paper)',
            border: '1px solid var(--border-default)',
            borderRadius: 12,
            padding: '40px 32px',
            boxShadow: 'var(--shadow-card-warm, 0 1px 2px rgba(20,20,20,0.04))',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-muted)',
              marginBottom: 8,
            }}
          >
            Signed out
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-serif), Georgia, serif',
              fontSize: 32,
              lineHeight: 1.2,
              fontWeight: 500,
              margin: 0,
              color: 'var(--ink-primary)',
            }}
          >
            Session ended
          </h1>
          <p
            style={{
              marginTop: 16,
              marginBottom: 0,
              color: 'var(--ink-secondary)',
              fontSize: 15,
              lineHeight: 1.55,
            }}
          >
            You have been signed out. You can close this tab.
          </p>
        </main>
      </div>
    </div>
  );
}
