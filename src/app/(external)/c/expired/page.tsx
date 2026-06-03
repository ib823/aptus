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
 *
 * Visuals (brief §3.9 / §5): the cream surface + wordmark + paper card is
 * the shared <TerminalScreen>; the contact block is <ConsultantContactCard>
 * fed the real bundle owner — never fixture data.
 */

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { PRESALES_COOKIE_NAME } from '@/lib/presales/cookies';
import { TerminalScreen } from '@/components/external/TerminalScreen';
import { ConsultantContactCard } from '@/components/external/ConsultantContactCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ reason?: string; bundleId?: string }>;
}

type ExpiredReason =
  | 'invalid_token'
  | 'expired_window'
  | 'revoked_grant'
  | 'superseded_grant'
  | 'session_expired'
  | 'otp_exhausted';

function copyFor(
  reason: string | undefined,
): { eyebrow: string; heading: string; body: string } {
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
        heading: 'This link has expired',
        body:
          'The access window for this workbench has ended. If you still need to review the decisions, your consultant can extend or reissue the link.',
      };
    case 'revoked_grant':
      return {
        eyebrow: 'Access withdrawn',
        heading: 'Access revoked',
        body:
          'Your secure access to this workbench has been withdrawn. Your ABeam consultant has been notified and will contact you with next steps.',
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
        eyebrow: 'Session ended',
        heading: 'Your session was signed out',
        body:
          'You signed out, or this link was opened on a different device. For security, you will need to start a new session.',
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

async function lookupContact(
  bundleId: string | undefined,
): Promise<ContactCard | null> {
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
    <TerminalScreen eyebrow={eyebrow} heading={heading} body={body}>
      {contact ? (
        <ConsultantContactCard
          name={contact.name}
          email={contact.email}
          phone={contact.phone}
        />
      ) : (
        <section
          style={{
            marginTop: 32,
            paddingTop: 24,
            borderTop: '1px solid var(--border-default)',
            fontSize: 13,
            color: 'var(--ink-secondary)',
            textAlign: 'left',
          }}
        >
          Please refer to the invitation email you received from your ABeam
          consultant, or reply to it if you need a new link.
        </section>
      )}
    </TerminalScreen>
  );
}
