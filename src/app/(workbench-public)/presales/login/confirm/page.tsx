/**
 * Workbench magic-link confirmation interstitial.
 *
 * Why this page exists: Outlook Safe Links (and many other corporate
 * email scanners) GET every link in incoming mail before showing it to
 * the recipient, to scan for malware/phishing. NextAuth email magic-links
 * are single-use — the first GET to /api/auth/callback/email consumes
 * the verification token. So when Outlook prefetches the link, the
 * recipient's actual click arrives at an already-consumed token and
 * NextAuth returns `error=Verification`.
 *
 * Fix: send a link to *this* page (which is harmless to prefetch) and
 * have it render a "Continue" button that the human clicks to navigate
 * to the real callback. Prefetchers hit /presales/login/confirm; only
 * the human click reaches /api/auth/callback/email.
 *
 * The `next` query param holds the original NextAuth callback URL. We
 * validate it server-side: must be same-origin AND must target the
 * email-callback path (no open-redirect risk).
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = { title: { absolute: 'Continue sign-in — Workbench' } };

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

function isAllowedNext(nextRaw: string, requestOrigin: string): boolean {
  try {
    const u = new URL(nextRaw);
    // Same-origin guard. Compare full origin (scheme+host+port).
    if (u.origin !== requestOrigin) return false;
    // Only allow the NextAuth email callback path.
    if (u.pathname !== '/api/auth/callback/email') return false;
    // Must carry a token.
    if (!u.searchParams.get('token')) return false;
    return true;
  } catch {
    return false;
  }
}

export default async function WorkbenchConfirmPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  // Read the request origin from headers. We don't need to know which host
  // is canonical — we just need the same-origin invariant relative to the
  // host the user is currently visiting.
  const { headers } = await import('next/headers');
  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? '';
  const proto = hdrs.get('x-forwarded-proto') ?? 'https';
  const requestOrigin = host ? `${proto}://${host}` : '';

  const isValid = !!next && !!requestOrigin && isAllowedNext(next, requestOrigin);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
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
          <div style={{ fontWeight: 700, fontSize: 18, color: '#002B5C' }}>Workbench</div>
        </div>

        {isValid ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: '#1A1A1A' }}>
              Confirm sign-in
            </h1>
            <p style={{ fontSize: 14, color: '#5A5A5A', marginTop: 8, marginBottom: 20, lineHeight: 1.5 }}>
              You&rsquo;re one click away from the Workbench. Click below to
              complete sign-in.
            </p>
            <a
              href={next}
              rel="noopener noreferrer"
              style={{
                display: 'block',
                textAlign: 'center',
                background: '#C8102E',
                color: '#FFFFFF',
                textDecoration: 'none',
                padding: '12px 18px',
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
              }}
            >
              Continue to Workbench
            </a>
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
              opened from a different address, or the underlying token may
              have already been used. Please request a new sign-in link.
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
