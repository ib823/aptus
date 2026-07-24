/**
 * POST /api/presales/grants/[grantId]/reissue
 *
 * Consultant mints a fresh grant for the same stakeholder. The old grant
 * is marked superseded (its supersededByGrantId points at the new row),
 * a new token is generated, the magic-link email is re-dispatched, and
 * audit rows land on both grants.
 *
 * Use cases:
 *   - Original magic-link expired before the prospect clicked through
 *   - Old grant was OTP-locked-out and consultant wants to give them another try
 *   - Prospect lost the email and needs a replacement
 *
 * Guards:
 *   - RBAC: reissue_grant
 *   - Bundle is in caller's org
 *   - Bundle is not signed (BUNDLE_SIGNED)
 *   - Bundle is not revoked (BUNDLE_REVOKED)
 *   - Grant exists and is not already superseded (GRANT_ALREADY_SUPERSEDED)
 *
 * The new grant inherits canSignOff from the old. Its expiresAt matches
 * the bundle's current expiresAt. OTP state is fresh (no prior attempts).
 *
 * Audit:
 *   - grant_reissued on old grant: { newGrantId }
 *   - grant_created on new grant: { reissuedFromGrantId }
 */

import { createHash, randomBytes } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { dispatchEmail, renderMagicLinkEmail } from '@/lib/presales/emails';
import { canPerformPresalesAction, lacksTenantScope } from '@/lib/presales/rbac';

interface RouteCtx {
  params: Promise<{ grantId: string }>;
}

function err(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function redirect(req: NextRequest, path: string): NextResponse {
  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json');
  if (wantsJson) return NextResponse.json({ ok: true, redirectPath: path });
  return NextResponse.redirect(new URL(path, req.url), { status: 303 });
}

import { workbenchPublicOrigin } from '@/lib/presales/public-origin';

function publicAppOrigin(req: NextRequest): string {
  return workbenchPublicOrigin(req);
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return err('UNAUTHENTICATED', 'Sign in required.', 401);
  if (!canPerformPresalesAction(user.role, 'reissue_grant')) {
    return err('FORBIDDEN', 'Your role cannot reissue grants.', 403);
  }
  // A non-admin with no org would drop the org filter below and match grants in
  // ANY tenant — reissuing (and re-dispatching a magic-link for) another org's
  // grant. Reject before querying. Matches revoke/extend.
  if (lacksTenantScope(user)) {
    return err('FORBIDDEN', 'No organization scope.', 403);
  }

  const { grantId } = await ctx.params;
  const oldGrant = await prisma.presalesAccessGrant.findFirst({
    where: {
      id: grantId,
      ...(user.organizationId
        ? { bundle: { organizationId: user.organizationId } }
        : {}),
    },
    include: { bundle: true },
  });
  if (!oldGrant) return err('NOT_FOUND', 'Grant not found.', 404);
  if (oldGrant.supersededByGrantId) {
    return err(
      'GRANT_ALREADY_SUPERSEDED',
      'This grant has already been replaced by a newer one.',
      409,
    );
  }
  if (oldGrant.bundle.signedAt) {
    return err('BUNDLE_SIGNED', 'Cannot reissue against a signed bundle.', 409);
  }
  if (oldGrant.bundle.revokedAt) {
    return err('BUNDLE_REVOKED', 'Cannot reissue against a revoked bundle.', 409);
  }

  const form = await req.formData();
  // Optional override: if the consultant entered a corrected email on the
  // recipient row before clicking Reissue, honor it on the new grant. The
  // R4 audit event for email correction lives on a separate route; this
  // one just mints a new token at whatever email is on the row.
  const overrideEmail = String(form.get('email') ?? '').trim();
  const targetEmail =
    overrideEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overrideEmail)
      ? overrideEmail
      : oldGrant.email;

  const rawToken = `pst_${randomBytes(24).toString('hex')}`;
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const now = new Date();

  const newGrant = await prisma.$transaction(async (tx) => {
    const created = await tx.presalesAccessGrant.create({
      data: {
        bundleId: oldGrant.bundleId,
        email: targetEmail,
        displayName: oldGrant.displayName,
        canSignOff: oldGrant.canSignOff,
        tokenHash,
        startsAt: now,
        expiresAt: oldGrant.bundle.expiresAt,
      },
    });
    await tx.presalesAccessGrant.update({
      where: { id: oldGrant.id },
      data: { supersededByGrantId: created.id, revokedAt: now, revokedBy: user.id },
    });
    await tx.presalesAuditEvent.create({
      data: {
        bundleId: oldGrant.bundleId,
        grantId: oldGrant.id,
        actorUserId: user.id,
        eventType: 'grant_reissued',
        payload: { newGrantId: created.id, targetEmail },
      },
    });
    await tx.presalesAuditEvent.create({
      data: {
        bundleId: oldGrant.bundleId,
        grantId: created.id,
        actorUserId: user.id,
        eventType: 'grant_created',
        payload: { email: targetEmail, canSignOff: oldGrant.canSignOff, reissuedFromGrantId: oldGrant.id },
      },
    });
    return created;
  });

  // Best-effort magic-link redispatch. A failed send does not roll back
  // the reissue; the consultant can manually share the link via the
  // dashboard if needed.
  const link = `${publicAppOrigin(req)}/c/${encodeURIComponent(rawToken)}`;
  await dispatchEmail(
    renderMagicLinkEmail({
      recipientName: oldGrant.displayName ?? targetEmail,
      recipientEmail: targetEmail,
      clientCompanyName: oldGrant.bundle.clientCompanyName,
      consultantName: user.name ?? user.email,
      linkUrl: link,
      expiresAtIso: oldGrant.bundle.expiresAt.toISOString(),
      acknowledgementVersion: oldGrant.bundle.acknowledgementTextVersion,
    }),
    { bestEffort: true },
  );
  void newGrant;

  return redirect(req, `/presales/${oldGrant.bundleId}`);
}
