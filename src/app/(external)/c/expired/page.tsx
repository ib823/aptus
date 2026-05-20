/**
 * GET /c/expired — polymorphic terminal state for the presales surface.
 *
 * Renders the same shell regardless of underlying reason so we never oracle
 * revocation state to a stranger. The reason query param drives the body
 * copy; if it's missing or unrecognised we show the generic "no longer
 * available" message.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ reason?: string }>;
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

export default async function PresalesExpiredPage({ searchParams }: PageProps) {
  const { reason } = await searchParams;
  const { eyebrow, heading, body } = copyFor(reason);
  return (
    <main style={{ maxWidth: 480, margin: '64px auto', padding: '0 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#5A5A5A', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {eyebrow}
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: '#002B5C' }}>{heading}</h1>
      <p style={{ marginTop: 16, color: '#5A5A5A', fontSize: 15 }}>{body}</p>
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
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Your ABeam contact</div>
        <div style={{ color: '#5A5A5A' }}>
          Sarah Tan · sarah.tan@abeam.com · +60 3 1234 5678
        </div>
      </div>
    </main>
  );
}
