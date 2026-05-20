/**
 * POST /c/end — end the current presales session.
 *
 * Clears the presales-session cookie, marks the PresalesSession row
 * ended (reason='logout'), writes a session_ended audit event, and
 * 303-redirects to /c/ended.
 *
 * Idempotent: posting to /c/end without a cookie still clears the cookie
 * (no-op on the client) and lands the user on /c/ended. We do NOT write a
 * session_invalid audit on a missing cookie here — the user is asking to
 * end something they may already have ended; that's benign, not attack-
 * shaped. We DO write session_invalid when a cookie is present but does
 * not resolve to a session row (tampering shape).
 */

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordSessionInvalid } from '@/lib/presales/audit-session';
import {
  PRESALES_COOKIE_NAME,
  clearPresalesCookie,
} from '@/lib/presales/cookies';
import { verifySessionNonce } from '@/lib/presales/csrf';
import {
  endPresalesSession,
  readPresalesSession,
} from '@/lib/presales/session';

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

  if (cookieValue) {
    const resolved = await readPresalesSession({ cookieValue });
    if (resolved) {
      // CSRF nonce required only when ending a live session. Idempotent
      // re-posts with no cookie skip this check (covered below).
      const form = await req.formData().catch(() => null);
      const csrf = form ? String(form.get('csrf') ?? '') : '';
      if (!verifySessionNonce(resolved.session.id, csrf)) {
        // Treat a bad nonce as benign (the user wanted to log out anyway)
        // — clear the cookie but skip the audit chain. The hostile-actor
        // pattern is "force someone to log out", which is recoverable;
        // not worth surfacing as a denied action.
      } else {
        await endPresalesSession({ sessionId: resolved.session.id, reason: 'logout' });
        await prisma.presalesAuditEvent.create({
          data: {
            bundleId: resolved.bundle.id,
            grantId: resolved.grant.id,
            eventType: 'session_ended',
            ip: ipOf(req),
            userAgent: req.headers.get('user-agent')?.slice(0, 512) ?? null,
            payload: { reason: 'logout' },
          },
        });
      }
    } else {
      // Cookie present but unresolvable — log as session_invalid.
      await recordSessionInvalid({
        cookieValue,
        ip: ipOf(req),
        userAgent: req.headers.get('user-agent') ?? null,
        attemptedPath: '/c/end',
      });
    }
  }

  const res = NextResponse.redirect(new URL('/c/ended', req.url), { status: 303 });
  const cleared = clearPresalesCookie();
  res.cookies.set({
    name: cleared.name,
    value: cleared.value,
    path: cleared.path,
    httpOnly: cleared.httpOnly,
    sameSite: cleared.sameSite,
    secure: cleared.secure,
    maxAge: cleared.maxAge,
  });
  return res;
}
