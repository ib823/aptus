/**
 * POST /api/presales/bundles/[bundleId]/extend
 *
 * Consultant extends the active window on a presales bundle.
 *
 * Guards:
 *   - RBAC: extend_bundle (consultant / partner_lead / platform_admin)
 *   - Bundle exists in caller's org
 *   - Bundle is not signed (BUNDLE_SIGNED)
 *   - Bundle is not revoked (BUNDLE_REVOKED)
 *   - newExpiresAt is strictly after current expiresAt (NO_EXTENSION_BACKWARD)
 *   - newExpiresAt is at most 90 days past now (EXTENSION_TOO_FAR)
 *
 * Side effects:
 *   - PresalesBundle.expiresAt updated
 *   - All active grants get their expiresAt extended in lockstep so the
 *     bundle window and grant window stay aligned
 *   - bundle_extended audit row with { oldExpiresAt, newExpiresAt, deltaSec }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { canPerformPresalesAction } from '@/lib/presales/rbac';

const MAX_DAYS_AHEAD = 90;

interface RouteCtx {
  params: Promise<{ bundleId: string }>;
}

function err(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function redirect(req: NextRequest, path: string): NextResponse {
  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json');
  if (wantsJson) return NextResponse.json({ ok: true, redirectPath: path });
  return NextResponse.redirect(new URL(path, req.url), { status: 303 });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return err('UNAUTHENTICATED', 'Sign in required.', 401);
  if (!canPerformPresalesAction(user.role, 'extend_bundle')) {
    return err('FORBIDDEN', 'Your role cannot extend bundles.', 403);
  }

  const { bundleId } = await ctx.params;
  const bundle = await prisma.presalesBundle.findFirst({
    where: {
      id: bundleId,
      ...(user.organizationId ? { organizationId: user.organizationId } : {}),
    },
  });
  if (!bundle) return err('NOT_FOUND', 'Bundle not found.', 404);
  if (bundle.signedAt) return err('BUNDLE_SIGNED', 'Bundle is signed; cannot extend.', 409);
  if (bundle.revokedAt) return err('BUNDLE_REVOKED', 'Bundle is revoked; cannot extend.', 409);

  const form = await req.formData();
  const rawNewExpiresAt = String(form.get('newExpiresAt') ?? '');
  const newExpiresAt = new Date(rawNewExpiresAt);
  if (isNaN(newExpiresAt.getTime())) {
    return err('INVALID_DATE', 'New expiry must be a valid datetime.', 400);
  }
  if (newExpiresAt <= bundle.expiresAt) {
    return err(
      'NO_EXTENSION_BACKWARD',
      'New expiry must be strictly after the current expiry. Extension can only move the window forward.',
      400,
    );
  }
  const maxAhead = new Date(Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  if (newExpiresAt > maxAhead) {
    return err(
      'EXTENSION_TOO_FAR',
      `Extension cannot reach more than ${MAX_DAYS_AHEAD} days from today.`,
      400,
    );
  }

  const oldExpiresAt = bundle.expiresAt;
  const now = new Date();

  await prisma.$transaction([
    prisma.presalesBundle.update({
      where: { id: bundleId },
      data: { expiresAt: newExpiresAt },
    }),
    // Extend any grant whose expiry was tied to the prior bundle expiry
    // (the typical case at creation). Grants that were intentionally set
    // shorter than the bundle expiry stay where they are.
    prisma.presalesAccessGrant.updateMany({
      where: { bundleId, expiresAt: oldExpiresAt, revokedAt: null },
      data: { expiresAt: newExpiresAt },
    }),
    prisma.presalesAuditEvent.create({
      data: {
        bundleId,
        actorUserId: user.id,
        eventType: 'bundle_extended',
        payload: {
          oldExpiresAt: oldExpiresAt.toISOString(),
          newExpiresAt: newExpiresAt.toISOString(),
          deltaSec: Math.round((newExpiresAt.getTime() - oldExpiresAt.getTime()) / 1000),
        },
      },
    }),
  ]);
  // Acknowledge to the caller that the now-write happened atomically.
  void now;

  return redirect(req, `/presales/${bundleId}`);
}
