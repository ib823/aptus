/**
 * GET /c/expired — polymorphic terminal state for the presales surface.
 *
 * Renders the same shell regardless of underlying reason so we never oracle
 * revocation state to a stranger. The reason query param drives the body
 * copy; if it's missing or unrecognised we show the generic "no longer
 * available" message.
 *
 * Optional bundleId query param: when the redirect callsite has bundle
 * context (which it does for all non-invalid_token reasons), we look up
 * the bundle's creator and render their real name/email/phone in the
 * contact card. Without bundleId, we show generic copy directing the
 * user to their original invitation email or to ABeam support.
 *
 * bundleId is not an info leak — bundle IDs are 25-char cuids
 * (~125 bits of entropy, not enumerable). The consultant info shown is
 * business-public (name + corporate email + work phone), not prospect
 * data. A failed lookup falls through to the generic fallback so this
 * page never confirms bundle existence to a probe.
 */

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { PRESALES_COOKIE_NAME } from '@/lib/presales/cookies';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ reason?: string; bundleId?: string }>;
}

/**
 * Six reason variants per Pass-7 spec. The query param is set by the gate
 * redirect server-side; we never trust it as user-controlled input — copy
 * is selected from a fixed switch and unknown values fall through to the
 * generic invalid_token body, so a hostile crawler cannot pivot the page
 * to a misleading message by editing the URL.
 */
type ExpiredReason =
  | 'invalid_token'
  | 'expired_window'
  | 'revoked_grant'
  | 'superseded_grant'
  | 'session_expired'
  | 'otp_exhausted';

function copyFor(reason: string | undefined): { eyebrow: string; heading: string; body: string } {
  switch (reason as ExpiredReason) {
    case 'otp_exhausted':
      return {
        eyebrow: 'Verification limit reached',
        heading: 'Access locked',
        body:
          'Too many incorrect verification attempts. Your ABeam consultant has been notified and can issue a fresh link.',
      };
    case 'expired_window':
      return {
        eyebrow: 'Time-limited link',
        heading: 'Link expired',
        body:
          'This presales workbench link has reached its expiry. Contact your ABeam consultant to receive a fresh one.',
      };
    case 'revoked_grant':
      return {
        eyebrow: 'Access withdrawn',
        heading: 'Access revoked',
        body:
          'Access to this workbench has been withdrawn. Contact your ABeam consultant for next steps.',
      };
    case 'superseded_grant':
      return {
        eyebrow: 'New invitation issued',
        heading: 'Link superseded',
        body:
          'A newer link was issued for this workbench. Please use the most recent invitation you received in your inbox.',
      };
    case 'session_expired':
      return {
        eyebrow: 'Inactive session',
        heading: 'Session ended',
        body:
          'Your session has expired. Open the link from your ABeam invitation email again to continue.',
      };
    case 'invalid_token':
    default:
      return {
        eyebrow: 'Link not active',
        heading: 'Link not available',
        body:
          'This link is not active. If you were expecting access, contact your ABeam consultant.',
      };
  }
}

interface ContactCard {
  name: string;
  email: string;
  phone: string | null;
}

async function lookupContact(bundleId: string | undefined): Promise<ContactCard | null> {
  if (!bundleId || bundleId.length < 16) return null;
  const bundle = await prisma.presalesBundle.findUnique({
    where: { id: bundleId },
    select: { creator: { select: { name: true, email: true, phone: true } } },
  });
  if (!bundle?.creator) return null;
  return {
    name: bundle.creator.name,
    email: bundle.creator.email,
    phone: bundle.creator.phone ?? null,
  };
}

/** When the redirect callsite didn't pass bundleId in the query (e.g.
 *  session_expired flows where the bundle context was only on the
 *  expired session row), recover it from the still-present cookie. The
 *  session may be expired/idled/revoked — we don't care; we just need
 *  the bundleId association to look up the right consultant. */
async function bundleIdFromCookie(): Promise<string | null> {
  const cookieJar = await cookies();
  const cookieValue = cookieJar.get(PRESALES_COOKIE_NAME)?.value;
  if (!cookieValue) return null;
  const session = await prisma.presalesSession.findUnique({
    where: { id: cookieValue },
    select: { bundleId: true },
  });
  return session?.bundleId ?? null;
}

export default async function PresalesExpiredPage({ searchParams }: PageProps) {
  const { reason, bundleId: queryBundleId } = await searchParams;
  const { eyebrow, heading, body } = copyFor(reason);
  const bundleId = queryBundleId ?? (await bundleIdFromCookie()) ?? undefined;
  const contact = await lookupContact(bundleId);
  return (
    <main style={{ maxWidth: 480, margin: '64px auto', padding: '0 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#5A5A5A', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {eyebrow}
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: '#002B5C' }}>{heading}</h1>
      <p style={{ marginTop: 16, color: '#5A5A5A', fontSize: 15 }}>{body}</p>
      {contact ? (
        <div
          style={{
            marginTop: 32,
            padding: 16,
            background: '#FFFFFF',
            border: '1px solid #E5E5E5',
            borderRadius: 12,
            textAlign: 'left',
            fontSize: 13,
          }}
        >
          <div style={{ fontSize: 11, color: '#5A5A5A', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Your ABeam contact
          </div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{contact.name}</div>
          <div style={{ color: '#5A5A5A' }}>
            {contact.email}
            {contact.phone ? <> · {contact.phone}</> : null}
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 32,
            padding: 16,
            background: '#FFFFFF',
            border: '1px solid #E5E5E5',
            borderRadius: 12,
            textAlign: 'left',
            fontSize: 13,
            color: '#5A5A5A',
          }}
        >
          Please refer to the invitation email you received from your ABeam consultant, or reply to it if you need a new link.
        </div>
      )}
    </main>
  );
}
