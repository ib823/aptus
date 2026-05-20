/**
 * POST /api/presales/bundles/[bundleId]/grants/[grantId]/email
 *
 * Consultant corrects a grant recipient's email address (typo recovery).
 * Permitted at any bundle state except revoked — the grant remains valid
 * for the new email; the old email simply no longer maps to this grant.
 *
 * Writes the grant_email_corrected audit event (R4) with the old and new
 * email values. The token does NOT change (the recipient is the same
 * person, just at a different address).
 *
 * If the grant has already been acknowledged from the old email, we
 * leave that fact alone — the acknowledgement audit timestamp from the
 * old email stays in the record, paired with the new email going forward.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { canPerformPresalesAction } from '@/lib/presales/rbac';

interface RouteCtx {
  params: Promise<{ bundleId: string; grantId: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  if (!canPerformPresalesAction(user.role, 'edit_bundle_draft')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  const { bundleId, grantId } = await ctx.params;

  const grant = await prisma.presalesAccessGrant.findFirst({
    where: {
      id: grantId,
      bundleId,
      ...(user.organizationId
        ? { bundle: { organizationId: user.organizationId } }
        : {}),
    },
  });
  if (!grant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  if (grant.revokedAt) return NextResponse.json({ error: { code: 'GRANT_REVOKED' } }, { status: 409 });

  const form = await req.formData();
  const newEmail = String(form.get('email') ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: { code: 'INVALID_EMAIL' } }, { status: 400 });
  }
  if (grant.email === newEmail) {
    return NextResponse.redirect(new URL(`/presales/${bundleId}`, req.url), { status: 303 });
  }

  const oldEmail = grant.email;
  await prisma.presalesAccessGrant.update({
    where: { id: grantId },
    data: { email: newEmail },
  });

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId,
      grantId,
      actorUserId: user.id,
      eventType: 'grant_email_corrected',
      payload: { oldEmail, newEmail },
    },
  });

  return NextResponse.redirect(new URL(`/presales/${bundleId}`, req.url), { status: 303 });
}
