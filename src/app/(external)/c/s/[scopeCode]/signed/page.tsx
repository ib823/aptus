/**
 * GET /c/s/[scopeCode]/signed — SIGNED state confirmation page.
 *
 * Renders after a successful POST /c/sign. Three blocks per design system
 * Pass 7:
 *   1. Signature record card (signatory, signed-at MYT + UTC,
 *      last-octet-redacted IP, document hash, reference).
 *   2. PDF download CTA.
 *   3. "What happens next" three-step list.
 *
 * The scope routes flip to read-only via the bundleSigned check on the
 * workbench page (already wired). This page is reachable from /c/s/[any
 * scope code]/signed and renders the same content — scopeCode is in the
 * URL only for navigation continuity, the page does not vary by scope.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { PRESALES_COOKIE_NAME } from '@/lib/presales/cookies';
import { issueSessionNonce } from '@/lib/presales/csrf';
import { readPresalesSession } from '@/lib/presales/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function redactIp(ip: string | null): string {
  if (!ip) return '—';
  // IPv4: redact last octet. IPv6: redact last segment.
  if (ip.includes(':')) {
    const parts = ip.split(':');
    parts[parts.length - 1] = 'xxxx';
    return parts.join(':');
  }
  const parts = ip.split('.');
  if (parts.length === 4) {
    parts[3] = 'xxx';
    return parts.join('.');
  }
  return '—';
}

export default async function PresalesSignedPage() {
  const cookieJar = await cookies();
  const cookieValue = cookieJar.get(PRESALES_COOKIE_NAME)?.value;
  const resolved = await readPresalesSession({ cookieValue });
  if (!resolved) redirect('/c/expired?reason=session_expired');
  if (!resolved.bundle.signedAt) {
    // No signoff yet — send the user back to the workbench. This page is
    // only meaningful in SIGNED state.
    redirect(`/c/s/${encodeURIComponent(resolved.bundle.defaultScopeCode)}`);
  }

  const signoffEvent = await prisma.presalesAuditEvent.findFirst({
    where: { bundleId: resolved.bundle.id, eventType: 'signoff_completed' },
    orderBy: { createdAt: 'desc' },
  });
  const signedIp = signoffEvent?.ip ?? null;

  const signedUtc = resolved.bundle.signedAt.toISOString();
  const signedMyt = resolved.bundle.signedAt.toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const hashShort = (resolved.bundle.signedPdfHash ?? '').slice(0, 12) || '—';

  const csrf = issueSessionNonce(resolved.session.id);

  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: '0 24px' }}>
      <header style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: '#5A5A5A', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Signed
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 600, margin: 0, color: '#002B5C' }}>
          {resolved.bundle.clientCompanyName} — decisions recorded
        </h1>
        <div style={{ height: 2, background: '#002B5C', width: 64, marginTop: 12 }} />
      </header>

      <section
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E5',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 14, color: '#5A5A5A', margin: 0, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Signature record
        </h2>
        <dl style={{ marginTop: 16, marginBottom: 0, display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, fontSize: 14 }}>
          <dt style={{ color: '#5A5A5A' }}>Signatory</dt>
          <dd style={{ margin: 0 }}>
            {resolved.grant.displayName ?? resolved.grant.email} · {resolved.grant.email}
          </dd>
          <dt style={{ color: '#5A5A5A' }}>Signed at</dt>
          <dd style={{ margin: 0 }}>
            {signedMyt} MYT
            <div style={{ color: '#5A5A5A', fontSize: 12 }}>{signedUtc} UTC</div>
          </dd>
          <dt style={{ color: '#5A5A5A' }}>From IP</dt>
          <dd style={{ margin: 0 }}>{redactIp(signedIp)}</dd>
          <dt style={{ color: '#5A5A5A' }}>Document hash</dt>
          <dd style={{ margin: 0, fontFamily: 'Consolas, monospace' }}>{hashShort}</dd>
          <dt style={{ color: '#5A5A5A' }}>Reference</dt>
          <dd style={{ margin: 0, fontFamily: 'Consolas, monospace' }}>{resolved.bundle.id}</dd>
          {resolved.bundle.signedWithinGrace ? (
            <>
              <dt style={{ color: '#5A5A5A' }}>Grace window</dt>
              <dd style={{ margin: 0, color: '#633806' }}>Signed within the 5-minute grace window</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E5',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 14, color: '#5A5A5A', margin: 0, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Your signed PDF
        </h2>
        <p style={{ fontSize: 14, color: '#5A5A5A', marginTop: 8 }}>
          A copy was emailed to {resolved.grant.email}. You can download it again here.
        </p>
        {resolved.bundle.signedPdfBlobUrl ? (
          <a
            href={resolved.bundle.signedPdfBlobUrl}
            style={{
              display: 'inline-block',
              marginTop: 8,
              background: '#002B5C',
              color: '#FFFFFF',
              textDecoration: 'none',
              padding: '10px 18px',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Download PDF
          </a>
        ) : (
          <div style={{ marginTop: 8, color: '#791F1F', fontSize: 13 }}>
            PDF generation is still in progress. Refresh in a moment, or contact your ABeam consultant.
          </div>
        )}
      </section>

      <section
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E5',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 14, color: '#5A5A5A', margin: 0, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          What happens next
        </h2>
        <ol style={{ paddingLeft: 20, marginTop: 12, marginBottom: 0, fontSize: 14, lineHeight: 1.6 }}>
          <li>Your ABeam consultant will follow up to confirm next steps and the Statement of Work timeline.</li>
          <li>Any open items appear in your PDF as &ldquo;No position taken &mdash; for resolution in Explore phase&rdquo;.</li>
          <li>You&rsquo;ll receive a separate confirmation from your consultant once the project kick-off is scheduled.</li>
        </ol>
      </section>

      <form method="POST" action="/c/end" style={{ marginTop: 16 }}>
        <input type="hidden" name="csrf" value={csrf} />
        <button
          type="submit"
          style={{
            background: 'transparent',
            color: '#5A5A5A',
            border: '1px solid #E5E5E5',
            padding: '8px 16px',
            fontSize: 13,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          End session
        </button>
      </form>
    </main>
  );
}
