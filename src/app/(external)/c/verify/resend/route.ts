/**
 * POST /c/verify/resend — re-issue the OTP code for the current session.
 *
 * Rate limits:
 *   - Max 3 resends per session (counted via otp_sent audit rows with
 *     payload.kind = 'resend' for this grant since session.issuedAt).
 *   - Minimum 30 seconds between resends.
 *
 * After exhausting the limit, the user is sent to /c/expired with the
 * otp_exhausted reason so they see the same contact-consultant card the
 * lockout flow uses. The grant is NOT auto-revoked by resend exhaustion —
 * only by failed OTP attempts (the maybeApplyOtpLockout path). Consultants
 * see the resend chain in the audit log either way.
 *
 * Side effects on every successful resend:
 *   - issuePresalesOtp overwrites otpHash + resets otpExpiresAt to now+10m
 *     and zeroes otpAttemptCount. The PRIOR code immediately stops working.
 *   - Audit row otp_sent { kind: 'resend' } is written for each resend.
 */

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordSessionInvalid } from '@/lib/presales/audit-session';
import { PRESALES_COOKIE_NAME } from '@/lib/presales/cookies';
import { verifySessionNonce } from '@/lib/presales/csrf';
import { issuePresalesOtp } from '@/lib/presales/otp';
import { readPresalesSession } from '@/lib/presales/session';

const MAX_RESENDS_PER_SESSION = 3;
const MIN_GAP_MS = 30_000;

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), { status: 303 });
}

function ipOf(req: NextRequest): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieJar = await cookies();
  const cookieValue = cookieJar.get(PRESALES_COOKIE_NAME)?.value;
  const resolved = await readPresalesSession({ cookieValue });
  if (!resolved) {
    await recordSessionInvalid({
      cookieValue,
      ip: ipOf(req),
      userAgent: req.headers.get('user-agent') ?? null,
      attemptedPath: '/c/verify/resend',
    });
    return redirectTo(req, '/c/expired?reason=session_expired');
  }

  const form = await req.formData();
  const csrf = String(form.get('csrf') ?? '');
  if (!verifySessionNonce(resolved.session.id, csrf)) {
    return redirectTo(req, '/c/verify?error=resend_rate_limited');
  }

  const now = new Date();

  // Resend count for THIS session (since session.issuedAt).
  const resendCount = await prisma.presalesAuditEvent.count({
    where: {
      grantId: resolved.grant.id,
      eventType: 'otp_sent',
      createdAt: { gte: resolved.session.issuedAt },
      payload: { path: ['kind'], equals: 'resend' },
    },
  });
  if (resendCount >= MAX_RESENDS_PER_SESSION) {
    return redirectTo(req, '/c/verify?error=resend_exhausted');
  }

  // 30-second gap from the most recent resend in this session.
  const lastResend = await prisma.presalesAuditEvent.findFirst({
    where: {
      grantId: resolved.grant.id,
      eventType: 'otp_sent',
      createdAt: { gte: resolved.session.issuedAt },
      payload: { path: ['kind'], equals: 'resend' },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (lastResend && now.getTime() - lastResend.createdAt.getTime() < MIN_GAP_MS) {
    return redirectTo(req, '/c/verify?error=resend_rate_limited');
  }

  await issuePresalesOtp(resolved.grant.id, now);
  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: resolved.bundle.id,
      grantId: resolved.grant.id,
      eventType: 'otp_sent',
      ip: ipOf(req),
      userAgent: req.headers.get('user-agent')?.slice(0, 512) ?? null,
      payload: { kind: 'resend', sessionId: resolved.session.id },
    },
  });

  return redirectTo(req, '/c/verify');
}
