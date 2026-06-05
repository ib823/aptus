/**
 * Workbench sign-in page.
 *
 * Lives under the (workbench) route group but does NOT require auth —
 * it's the entry point. Triggers the same NextAuth email magic-link
 * flow the Aptus portal uses, but with /presales as the callbackUrl
 * so successful sign-in lands the consultant on the bundles index
 * (not the Aptus dashboard).
 *
 * Reuses the existing Brevo SMTP transport via NextAuth's email
 * provider; no separate email plumbing needed.
 */

import { Wordmark } from '@/components/brand/Wordmark';
import { WorkbenchLoginForm } from './WorkbenchLoginForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = { title: { absolute: 'Sign in — ABeam Workbench' } };

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

/**
 * Map a NextAuth error code (forwarded here from /login by the middleware,
 * query preserved) to a human explanation. Naming the failure is what turns
 * a silent "bounced back to sign-in" loop into an actionable message — and
 * tells us which gate rejected the magic-link click:
 *   - Verification → the single-use token was expired or already consumed
 *     (corporate link-scanners like Outlook Safe Links can open it first).
 *   - AccessDenied → the account exists but is inactive / not authorised.
 */
function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'Verification':
      return 'That sign-in link had already expired or been used. Some corporate email scanners (e.g. Outlook Safe Links) open links automatically, which can use up a one-time link before you click it. Request a fresh link below and open it promptly.';
    case 'AccessDenied':
      return 'This email is not active for ABeam Workbench — the account may be deactivated or not yet authorised. Ask your ABeam admin to enable access.';
    case 'Configuration':
      return 'Sign-in is misconfigured on the server. Please contact your administrator.';
    default:
      return 'Sign-in didn’t complete. Enter your email below to request a new link.';
  }
}

export default async function WorkbenchLoginPage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const initialError = errorMessage(error);
  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'grid', placeItems: 'center', padding: '24px 16px' }}>
      <main
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#FFFFFF',
          border: '1px solid #E5E5E5',
          borderRadius: 12,
          padding: '32px 28px',
          boxShadow: '0 4px 24px rgba(0, 43, 92, 0.06)',
        }}
      >
        <div style={{ marginBottom: 24, textAlign: 'center', display: 'grid', gap: 6, placeItems: 'center' }}>
          <Wordmark size="lg" />
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Presales decisions
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: '#1A1A1A' }}>Sign in</h1>
        <p style={{ fontSize: 14, color: '#5A5A5A', marginTop: 4, marginBottom: 20 }}>
          Enter your work email and we&rsquo;ll send a one-time link.
        </p>

        <WorkbenchLoginForm initialError={initialError} />

        <div style={{ fontSize: 12, color: '#888780', marginTop: 24, textAlign: 'center' }}>
          For ABeam consultants. By signing in you agree to use ABeam Workbench in line with the engagement policies your team has set.
        </div>
      </main>
    </div>
  );
}
