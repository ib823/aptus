/**
 * ABeam Workbench — Off-session audit writer.
 *
 * Used by every /c surface that expects a session (verify, verify/submit,
 * scope, decisions, end) when the cookie does not resolve to a valid
 * session. The audit fires for both classes of failure:
 *
 *   - "Stale" failures: cookie points to a real session row but the row is
 *     expired/idled/revoked. We can resolve bundleId from the row.
 *
 *   - "Tampered" failures: cookie value is malformed, missing from the DB,
 *     or otherwise unmatchable. We have no bundleId; the audit row's
 *     bundleId column stays NULL — that's the "off-bundle tampering" signal
 *     documented near PresalesAuditEvent in the schema.
 *
 * NOT called from:
 *   - /c/[token] landing GET (no session expected)
 *   - /c/[token]/redeem POST (no session yet)
 *   - /c/expired / /c/ended (terminal pages, no session expected)
 */

import { prisma } from '@/lib/db/prisma';

export interface SessionInvalidContext {
  cookieValue: string | undefined;
  ip: string | null;
  userAgent: string | null;
  attemptedPath: string;
}

export async function recordSessionInvalid(ctx: SessionInvalidContext): Promise<void> {
  let bundleId: string | null = null;
  let grantId: string | null = null;

  // Even if the session is expired/idle/revoked, the row itself still
  // tells us which bundle the cookie was bound to. Look it up best-effort
  // — a missing row leaves bundleId/grantId null which is the "tampering"
  // signal.
  if (ctx.cookieValue) {
    try {
      const session = await prisma.presalesSession.findUnique({
        where: { id: ctx.cookieValue },
        select: { bundleId: true, grantId: true },
      });
      if (session) {
        bundleId = session.bundleId;
        grantId = session.grantId;
      }
    } catch {
      /* Treat any lookup failure as off-bundle tampering. Audit still
         lands with null bundleId. */
    }
  }

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId,
      grantId,
      eventType: 'external_action_denied',
      ip: ctx.ip,
      userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 512) : null,
      payload: {
        reason: 'session_invalid',
        attemptedPath: ctx.attemptedPath,
        hadCookie: !!ctx.cookieValue,
      },
    },
  });
}
