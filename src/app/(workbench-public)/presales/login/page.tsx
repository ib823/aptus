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

import { WorkbenchLoginForm } from './WorkbenchLoginForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = { title: { absolute: 'Sign in — ABeam Workbench' } };

export default function WorkbenchLoginPage() {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 32,
              height: 32,
              background: '#002B5C',
              borderRadius: 6,
              position: 'relative',
            }}
          >
            <span style={{ position: 'absolute', inset: 8, background: '#C8102E', borderRadius: 2 }} />
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#002B5C', letterSpacing: '-0.01em' }}>
              ABeam Workbench
            </div>
            <div style={{ fontSize: 11, color: '#5A5A5A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Presales decisions
            </div>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: '#1A1A1A' }}>Sign in</h1>
        <p style={{ fontSize: 14, color: '#5A5A5A', marginTop: 4, marginBottom: 20 }}>
          Enter your work email and we&rsquo;ll send a one-time link.
        </p>

        <WorkbenchLoginForm />

        <div style={{ fontSize: 12, color: '#888780', marginTop: 24, textAlign: 'center' }}>
          For ABeam consultants. By signing in you agree to use ABeam Workbench in line with the engagement policies your team has set.
        </div>
      </main>
    </div>
  );
}
