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
 * Visuals (brief §3.9 / §5):
 *   - Cream surface, centered card
 *   - ABeam Workbench wordmark above the card (§5)
 *   - Contact card with avatar circle (initials in navy on navy-soft),
 *     name in semibold, email + phone as anchors, "Email {firstName}"
 *     CTA in CTA red.
 */

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { PRESALES_COOKIE_NAME } from '@/lib/presales/cookies';
import { Wordmark } from '@/components/brand/Wordmark';

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

export default async function PresalesExpiredPage({ searchParams }: PageProps) {
  const { reason, bundleId: queryBundleId } = await searchParams;
  const { eyebrow, heading, body } = copyFor(reason);
  const bundleId = queryBundleId ?? (await bundleIdFromCookie()) ?? undefined;
  const contact = await lookupContact(bundleId);

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
            {eyebrow}
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
            {heading}
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
            {body}
          </p>

          {contact ? (
            <section
              style={{
                marginTop: 32,
                paddingTop: 24,
                borderTop: '1px solid var(--border-default)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-muted)',
                  marginBottom: 12,
                }}
              >
                Your ABeam contact
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  aria-hidden
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 9999,
                    background: 'var(--brand-navy-soft)',
                    color: 'var(--brand-navy)',
                    fontFamily: 'var(--font-serif), Georgia, serif',
                    fontSize: 18,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {initials(contact.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: 'var(--ink-primary)',
                    }}
                  >
                    {contact.name}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: 'var(--ink-secondary)',
                      marginTop: 2,
                    }}
                  >
                    <a
                      href={`mailto:${contact.email}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {contact.email}
                    </a>
                    {contact.phone ? (
                      <>
                        {' · '}
                        <a
                          href={`tel:${contact.phone.replace(/\s/g, '')}`}
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {contact.phone}
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <a
                  href={`mailto:${contact.email}?subject=${encodeURIComponent('Re: presales workbench access')}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 40,
                    padding: '0 18px',
                    background: 'var(--cta-red)',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 600,
                    borderRadius: 8,
                    textDecoration: 'none',
                  }}
                >
                  Email {firstName(contact.name)}
                </a>
              </div>
            </section>
          ) : (
            <section
              style={{
                marginTop: 32,
                paddingTop: 24,
                borderTop: '1px solid var(--border-default)',
                fontSize: 13,
                color: 'var(--ink-secondary)',
              }}
            >
              Please refer to the invitation email you received from your ABeam
              consultant, or reply to it if you need a new link.
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
