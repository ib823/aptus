/**
 * POST /c/verify/submit — presales OTP verify.
 *
 * Looks up the session by cookie, verifies the 6-digit code, and either
 * redirects to /c/s/[defaultScopeCode] (success), back to /c/verify with
 * an error code (invalid / expired), or to /c/expired (locked).
 */

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { recordSessionInvalid } from '@/lib/presales/audit-session';
import { PRESALES_COOKIE_NAME } from '@/lib/presales/cookies';
import { verifySessionNonce } from '@/lib/presales/csrf';
import { verifyPresalesOtp } from '@/lib/presales/otp';
import { readPresalesSession } from '@/lib/presales/session';
import { hashUserAgent } from '@/lib/presales/ua-fingerprint';

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), { status: 303 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieJar = await cookies();
  const cookieValue = cookieJar.get(PRESALES_COOKIE_NAME)?.value;
  const resolved = await readPresalesSession({ cookieValue });
  if (!resolved) {
    await recordSessionInvalid({
      cookieValue,
      ip:
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        null,
      userAgent: req.headers.get('user-agent') ?? null,
      attemptedPath: '/c/verify/submit',
    });
    return redirectTo(req, '/c/expired?reason=session_expired');
  }

  const form = await req.formData();
  const csrf = String(form.get('csrf') ?? '');
  if (!verifySessionNonce(resolved.session.id, csrf)) {
    return redirectTo(req, '/c/verify?error=invalid&remaining=5');
  }
  const code = String(form.get('otp') ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    return redirectTo(req, '/c/verify?error=invalid&remaining=5');
  }

  const ua = req.headers.get('user-agent') ?? '';
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const uaHash = hashUserAgent(ua);

  const result = await verifyPresalesOtp({
    grantId: resolved.grant.id,
    code,
    uaHash,
    ip,
    userAgent: ua.slice(0, 512),
  });
  switch (result.kind) {
    case 'ok':
      return redirectTo(req, `/c/s/${encodeURIComponent(resolved.bundle.defaultScopeCode)}`);
    case 'invalid':
      return redirectTo(
        req,
        `/c/verify?error=invalid&remaining=${result.attemptsRemaining}`,
      );
    case 'expired':
      return redirectTo(req, '/c/verify?error=expired');
    case 'locked':
      return redirectTo(req, '/c/expired?reason=otp_exhausted');
    default:
      return redirectTo(req, '/c/verify?error=invalid&remaining=0');
  }
}
