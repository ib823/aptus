/**
 * POST /c/[token]/redeem — presales acknowledgement + session start.
 *
 * Sequence:
 *   1. Validate CSRF nonce against the URL token.
 *   2. Resolve token → grant → bundle. Reject if any guard fires.
 *   3. Record acknowledgement fields on the grant.
 *   4. Decide OTP gate: if the grant has never been OTP-verified, issue a
 *      6-digit code and redirect to /c/verify. Otherwise go straight to
 *      /c/s/[defaultScopeCode].
 *   5. Create the PresalesSession and set the presales-session cookie.
 *   6. Write the grant_acknowledged + session_started audit events.
 *   7. 303 redirect — drops the token from the URL.
 *
 * Tokenless after this point. The cookie carries the session id; the URL
 * never carries the grant token again.
 */

import { createHash } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { buildPresalesCookie } from '@/lib/presales/cookies';
import { verifyRedeemNonce } from '@/lib/presales/csrf';
import { issuePresalesOtp } from '@/lib/presales/otp';
import { createPresalesSession } from '@/lib/presales/session';
import { hashUserAgent } from '@/lib/presales/ua-fingerprint';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function clientUa(req: NextRequest): string {
  return req.headers.get('user-agent')?.slice(0, 512) ?? 'unknown';
}

/**
 * Per-device OTP gate check. Returns true iff a prior otp_verified audit
 * event exists for this grant with a payload.uaHash equal to the current
 * device's normalized UA hash. JSON path query via Prisma raw filter —
 * `path: ['uaHash']` resolves to the JSONB `payload->>'uaHash'` extractor.
 *
 * Second-device scenario (CFO verified on laptop, now opens on phone):
 * laptop's otp_verified row stays untouched. The phone's uaHash does NOT
 * match, so we fall through and trigger a fresh OTP for the phone. The
 * audit trail then shows: laptop verified once, phone required separate
 * verification. Forensic clarity preserved.
 */
async function hasOtpVerificationForDevice(
  grantId: string,
  uaHash: string,
): Promise<boolean> {
  const prior = await prisma.presalesAuditEvent.findFirst({
    where: {
      grantId,
      eventType: 'otp_verified',
      payload: { path: ['uaHash'], equals: uaHash },
    },
    select: { id: true },
  });
  return !!prior;
}

interface RouteContext {
  params: Promise<{ token: string }>;
}

function redirectTo(req: NextRequest, path: string, init?: ResponseInit): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), { status: 303, ...init });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { token } = await ctx.params;
  if (!token || token.length < 16) {
    return redirectTo(req, '/c/expired?reason=invalid_token');
  }

  const form = await req.formData();
  const csrf = String(form.get('csrf') ?? '');
  if (!verifyRedeemNonce(token, csrf)) {
    return redirectTo(req, `/c/${encodeURIComponent(token)}?csrf=stale`);
  }

  const acknowledgeLegal = form.get('acknowledge_legal') === '1';
  if (!acknowledgeLegal) {
    return redirectTo(req, `/c/${encodeURIComponent(token)}?ack=missing`);
  }
  const pdpaCrossBorder = form.get('pdpa_consent_cross_border') === '1';

  const tokenHash = hashToken(token);
  const grant = await prisma.presalesAccessGrant.findUnique({
    where: { tokenHash },
    include: { bundle: true },
  });
  const now = new Date();
  if (!grant) return redirectTo(req, '/c/expired?reason=invalid_token');
  const bundleQs = `&bundleId=${encodeURIComponent(grant.bundle.id)}`;
  if (grant.revokedAt) return redirectTo(req, `/c/expired?reason=revoked_grant${bundleQs}`);
  if (grant.supersededByGrantId) return redirectTo(req, `/c/expired?reason=superseded_grant${bundleQs}`);
  if (grant.expiresAt <= now) return redirectTo(req, `/c/expired?reason=expired_window${bundleQs}`);
  if (grant.bundle.revokedAt) return redirectTo(req, `/c/expired?reason=revoked_grant${bundleQs}`);
  if (grant.bundle.expiresAt <= now) return redirectTo(req, `/c/expired?reason=expired_window${bundleQs}`);

  const ip = clientIp(req);
  const ua = clientUa(req);

  await prisma.presalesAccessGrant.update({
    where: { id: grant.id },
    data: {
      acknowledgedAt: grant.acknowledgedAt ?? now,
      acknowledgedIp: grant.acknowledgedIp ?? ip,
      acknowledgedUa: grant.acknowledgedUa ?? ua,
      acknowledgementTextVersion:
        grant.acknowledgementTextVersion ?? grant.bundle.acknowledgementTextVersion,
      pdpaConsentTextVersion:
        grant.pdpaConsentTextVersion ?? grant.bundle.pdpaNoticeTextVersion,
      pdpaConsentCrossBorder: grant.pdpaConsentCrossBorder || pdpaCrossBorder,
      lastAccessedAt: now,
      accessCount: { increment: 1 },
    },
  });

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: grant.bundleId,
      grantId: grant.id,
      eventType: 'grant_acknowledged',
      ip,
      userAgent: ua,
    },
  });

  const session = await createPresalesSession({
    grantId: grant.id,
    bundleId: grant.bundleId,
    ip,
    userAgent: ua,
    now,
  });

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: grant.bundleId,
      grantId: grant.id,
      eventType: 'session_started',
      ip,
      userAgent: ua,
    },
  });

  const uaHash = hashUserAgent(ua);
  const otpAlreadyDone = await hasOtpVerificationForDevice(grant.id, uaHash);
  const target = otpAlreadyDone
    ? `/c/s/${encodeURIComponent(grant.bundle.defaultScopeCode)}`
    : '/c/verify';

  if (!otpAlreadyDone) {
    await issuePresalesOtp(grant.id, now);
    await prisma.presalesAuditEvent.create({
      data: {
        bundleId: grant.bundleId,
        grantId: grant.id,
        eventType: 'otp_sent',
        ip,
        userAgent: ua,
      },
    });
  }

  const res = redirectTo(req, target);
  const cookie = buildPresalesCookie(session.id);
  res.cookies.set({
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    maxAge: cookie.maxAge,
  });
  return res;
}
