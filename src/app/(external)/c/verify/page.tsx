/**
 * GET /c/verify — presales OTP entry.
 *
 * Reads the presales-session cookie to identify the grant. Renders a
 * 6-digit code input. The POST submits to /c/verify/submit which validates
 * and either advances to /c/s/[defaultScopeCode] or shows the rejection.
 *
 * Lockout cascade is enforced inside verifyPresalesOtp (which calls
 * maybeApplyOtpLockout). At lockout the grant is auto-revoked and the
 * next request lands on /c/expired?reason=otp_exhausted.
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { recordSessionInvalid } from '@/lib/presales/audit-session';
import { PRESALES_COOKIE_NAME } from '@/lib/presales/cookies';
import { issueSessionNonce } from '@/lib/presales/csrf';
import { readPresalesSession } from '@/lib/presales/session';
import { OtpInput } from '@/components/external/OtpInput';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ error?: string; remaining?: string }>;
}

export default async function PresalesVerifyPage({ searchParams }: PageProps) {
  const cookieJar = await cookies();
  const cookieValue = cookieJar.get(PRESALES_COOKIE_NAME)?.value;
  const resolved = await readPresalesSession({ cookieValue });
  if (!resolved) {
    const hdrs = await headers();
    await recordSessionInvalid({
      cookieValue,
      ip:
        hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        hdrs.get('x-real-ip') ??
        null,
      userAgent: hdrs.get('user-agent') ?? null,
      attemptedPath: '/c/verify',
    });
    redirect('/c/expired?reason=session_expired');
  }

  const { error } = await searchParams;
  // Persistent attempts-remaining display: derive from grant.otpAttemptCount
  // on every render. The query-param `remaining` from the POST redirect was
  // unreliable — when the user navigated back to /c/verify (no query param)
  // the counter vanished, making the persistent-DB-count behavior look like
  // it was resetting. The display now reflects DB state for every render.
  const MAX_OTP_ATTEMPTS = 5;
  const dbAttempts = resolved.grant.otpAttemptCount;
  const remainingAttempts = Math.max(0, MAX_OTP_ATTEMPTS - dbAttempts);
  const errorMessage =
    error === 'invalid'
      ? `Code did not match. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before the grant locks.`
      : error === 'expired'
        ? 'Code expired — request a new one below.'
        : error === 'locked'
          ? 'Too many failed attempts. Your access has been revoked. Contact your ABeam consultant.'
          : error === 'resend_rate_limited'
            ? 'Please wait at least 30 seconds before requesting another code.'
            : error === 'resend_exhausted'
              ? 'You have requested the maximum number of codes for this session. Contact your ABeam consultant.'
              : null;

  return (
    <main style={{ maxWidth: 480, margin: '64px auto', padding: '0 16px' }}>
      <header style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 14, color: '#5A5A5A', marginBottom: 8 }}>Workbench</div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: '#002B5C' }}>
          Enter your verification code
        </h1>
        <p style={{ marginTop: 12, color: '#5A5A5A' }}>
          We sent a 6-digit code to {resolved.grant.email}. Enter it below to continue.
        </p>
        {dbAttempts > 0 ? (
          <p style={{ marginTop: 8, fontSize: 13, color: '#888780' }}>
            {remainingAttempts} attempt{remainingAttempts === 1 ? '' : 's'} remaining before the grant locks.
          </p>
        ) : null}
      </header>

      {errorMessage ? (
        <div
          role="alert"
          style={{
            background: '#FCEBEB',
            color: '#791F1F',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      <form
        method="POST"
        action="/c/verify/submit"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E5',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <input type="hidden" name="csrf" value={issueSessionNonce(resolved.session.id)} />
        <div
          id="otp-label"
          style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}
        >
          Verification code
        </div>
        <div style={{ marginBottom: 24 }}>
          <OtpInput name="otp" length={6} />
        </div>
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
          Verify
        </button>
      </form>

      <form
        method="POST"
        action="/c/verify/resend"
        style={{ marginTop: 16, textAlign: 'center' }}
      >
        <input type="hidden" name="csrf" value={issueSessionNonce(resolved.session.id)} />
        <button
          type="submit"
          style={{
            background: 'transparent',
            color: '#5A5A5A',
            border: 'none',
            padding: '8px 12px',
            fontSize: 13,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Resend code
        </button>
      </form>
    </main>
  );
}
