/**
 * GET /c/[token] — presales landing.
 *
 * Idempotent. No DB writes, no cookie set. Scanner-safe: a security crawler
 * that hits this URL leaves no audit trail and creates no state. The
 * acknowledgement-recorded side effect lives in the POST /c/[token]/redeem
 * handler.
 *
 * The rendered form is a single-action click-through gate:
 *   - Legal acknowledgement checkbox
 *   - PDPA cross-border consent checkbox
 *   - Hidden CSRF nonce (stateless HMAC)
 *   - Submit posts to /c/[token]/redeem
 *
 * Polymorphic missing-state handling: if the token does not resolve to an
 * active grant (expired, revoked, superseded, or never existed), we render
 * the expired page at /c/expired with the relevant reason — never reveal
 * which one applies (don't oracle revocation status to a stranger).
 */

import { createHash } from 'crypto';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { issueRedeemNonce } from '@/lib/presales/csrf';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ token: string }>;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export default async function PresalesLandingPage({ params }: PageProps) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const tokenHash = hashToken(token);
  const grant = await prisma.presalesAccessGrant.findUnique({
    where: { tokenHash },
    include: { bundle: true },
  });

  if (!grant) redirect('/c/expired?reason=invalid_token');
  const bundleQs = `&bundleId=${encodeURIComponent(grant.bundle.id)}`;
  if (grant.revokedAt) redirect(`/c/expired?reason=revoked_grant${bundleQs}`);
  if (grant.supersededByGrantId) redirect(`/c/expired?reason=superseded_grant${bundleQs}`);

  const now = new Date();
  if (grant.expiresAt <= now) redirect(`/c/expired?reason=expired_window${bundleQs}`);
  if (grant.bundle.revokedAt) redirect(`/c/expired?reason=revoked_grant${bundleQs}`);
  if (grant.bundle.expiresAt <= now) redirect(`/c/expired?reason=expired_window${bundleQs}`);

  const nonce = issueRedeemNonce(token);

  return (
    <main
      style={{
        maxWidth: 560,
        margin: '64px auto',
        padding: '0 16px',
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 14, color: '#5A5A5A', marginBottom: 8 }}>
          ABeam Workbench
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: '#002B5C' }}>
          {grant.bundle.clientCompanyName}
        </h1>
        <p style={{ marginTop: 12, color: '#5A5A5A' }}>
          Welcome, {grant.displayName ?? grant.email}. Before you continue, please
          confirm the acknowledgements below.
        </p>
      </header>

      <form
        method="POST"
        action={`/c/${encodeURIComponent(token)}/redeem`}
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E5',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <input type="hidden" name="csrf" value={nonce} />

        <label
          style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}
        >
          <input
            type="checkbox"
            name="acknowledge_legal"
            value="1"
            required
            style={{ marginTop: 4 }}
          />
          <span style={{ fontSize: 14 }}>
            I confirm I am the named recipient ({grant.email}) and I am authorized
            to review the proposal contents on behalf of {grant.bundle.clientCompanyName}.
          </span>
        </label>

        <label style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            name="pdpa_consent_cross_border"
            value="1"
            style={{ marginTop: 4 }}
          />
          <span style={{ fontSize: 14 }}>
            I consent to my access and decisions being processed on infrastructure
            located outside Malaysia, in line with the PDPA cross-border notice
            (version {grant.bundle.pdpaNoticeTextVersion}).
          </span>
        </label>

        <button
          type="submit"
          style={{
            background: '#C8102E',
            color: '#FFFFFF',
            border: 'none',
            padding: '12px 24px',
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 8,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Continue
        </button>
      </form>

      <p style={{ marginTop: 24, fontSize: 12, color: '#5A5A5A', textAlign: 'center' }}>
        Acknowledgement v{grant.bundle.acknowledgementTextVersion} · This link
        expires {grant.expiresAt.toISOString().slice(0, 10)}
      </p>
    </main>
  );
}
