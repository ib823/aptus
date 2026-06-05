/**
 * Workbench magic-link confirmation interstitial.
 *
 * Why this page exists: corporate email scanners (Outlook Safe Links and the
 * like) GET every link in incoming mail — and sometimes "detonate" it by
 * rendering the page and following its links/nested URLs — before the human
 * sees it. NextAuth email magic-links are single-use: the first GET to
 * /api/auth/callback/email consumes the verification token. So a naive link
 * lets the scanner burn the token first, and the human's click then arrives
 * at an already-consumed token (error=Verification) — which reads as a
 * sign-in that loops back to the login page.
 *
 * Fix: the email link carries the callback URL SEALED (AES-256-GCM) as ?c=.
 * This page decrypts it server-side and renders a POST form whose only
 * payload is the same opaque ciphertext — the callback URL is never placed in
 * any GET-reachable spot. Scanners GET this page (harmless) but do not submit
 * POST forms, so only the human's click reaches the callback (via the
 * POST-only /presales/login/continue handler).
 *
 * Legacy: older in-flight emails used a plaintext ?next= link. We still
 * accept and validate it so links already in inboxes keep working.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = { title: { absolute: 'Continue sign-in — ABeam Workbench' } };

import type { CSSProperties } from 'react';
import { Wordmark } from '@/components/brand/Wordmark';
import {
  CONTINUE_PATH,
  isValidCallback,
  openSealedCallbackUrl,
} from '@/lib/auth/magic-link-confirm';

interface PageProps {
  searchParams: Promise<{ c?: string; next?: string }>;
}

const redButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'center',
  background: '#C8102E',
  color: '#FFFFFF',
  textDecoration: 'none',
  border: 'none',
  padding: '12px 18px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  cursor: 'pointer',
};

export default async function WorkbenchConfirmPage({ searchParams }: PageProps) {
  const { c, next } = await searchParams;

  // Read the request origin from headers. We don't need to know which host is
  // canonical — only the same-origin invariant relative to the host the user
  // is currently visiting.
  const { headers } = await import('next/headers');
  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? '';
  const proto = hdrs.get('x-forwarded-proto') ?? 'https';
  const requestOrigin = host ? `${proto}://${host}` : '';

  // Preferred path: sealed callback (?c=). Decrypt + validate server-side; the
  // decrypted URL is NEVER rendered — the form submits only the ciphertext.
  let sealedValid = false;
  if (c && requestOrigin) {
    const opened = openSealedCallbackUrl(c);
    sealedValid = !!opened && isValidCallback(opened, requestOrigin);
  }

  // Legacy path: plaintext ?next= (older in-flight links), still validated.
  const legacyValid =
    !sealedValid && !!next && !!requestOrigin && isValidCallback(next, requestOrigin);

  const isValid = sealedValid || legacyValid;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F8FAFC',
        display: 'grid',
        placeItems: 'center',
        padding: '24px 16px',
      }}
    >
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
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <Wordmark size="lg" />
        </div>

        {isValid ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: '#1A1A1A' }}>
              Confirm sign-in
            </h1>
            <p style={{ fontSize: 14, color: '#5A5A5A', marginTop: 8, marginBottom: 20, lineHeight: 1.5 }}>
              You&rsquo;re one click away from ABeam Workbench. Click below to
              complete sign-in.
            </p>
            {sealedValid ? (
              <form method="POST" action={CONTINUE_PATH} style={{ margin: 0 }}>
                <input type="hidden" name="c" value={c} />
                <button type="submit" style={redButtonStyle}>
                  Continue to ABeam Workbench
                </button>
              </form>
            ) : (
              <a href={next} rel="noopener noreferrer" style={redButtonStyle}>
                Continue to ABeam Workbench
              </a>
            )}
            <p style={{ fontSize: 12, color: '#888780', marginTop: 18, lineHeight: 1.5 }}>
              This extra click protects your sign-in from corporate email
              link-scanners (e.g. Outlook Safe Links) that would otherwise
              invalidate your single-use link before you get to use it.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: '#1A1A1A' }}>
              Link expired or invalid
            </h1>
            <p style={{ fontSize: 14, color: '#5A5A5A', marginTop: 8, marginBottom: 20, lineHeight: 1.5 }}>
              We couldn&rsquo;t verify this sign-in link. It may have been
              opened from a different address, or the underlying token may have
              already been used. Please request a new sign-in link.
            </p>
            <a
              href="/presales/login"
              style={{
                display: 'block',
                textAlign: 'center',
                background: '#002B5C',
                color: '#FFFFFF',
                textDecoration: 'none',
                padding: '12px 18px',
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
              }}
            >
              Back to sign-in
            </a>
          </>
        )}
      </main>
    </div>
  );
}
