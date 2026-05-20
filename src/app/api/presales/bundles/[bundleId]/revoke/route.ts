/**
 * POST /api/presales/bundles/[bundleId]/revoke
 *
 * Consultant withdraws a presales bundle. The bundle stays in the DB
 * (audit trail + PDPA evidence) but no guest can use it anymore — the
 * session-validation guard in readPresalesSession checks bundle.revokedAt
 * and rejects, so all in-flight guest sessions are dead on next request.
 *
 * Guards:
 *   - RBAC: revoke_bundle
 *   - Bundle exists in caller's org
 *   - Bundle is not signed (BUNDLE_SIGNED — once signed, revoking would
 *     contradict the signoff record; cancellation goes through change request)
 *   - Bundle is not already revoked (BUNDLE_ALREADY_REVOKED)
 *
 * Side effects:
 *   - bundle.revokedAt / revokedBy / revokedReason set
 *   - bundle_revoked audit row written
 *   - Grants are NOT modified — the bundle-level revoke flag is the
 *     authoritative guard; modifying every grant row would duplicate state.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { canPerformPresalesAction } from '@/lib/presales/rbac';

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
  if (!canPerformPresalesAction(user.role, 'revoke_bundle')) {
    return err('FORBIDDEN', 'Your role cannot revoke bundles.', 403);
  }

  const { bundleId } = await ctx.params;
  const bundle = await prisma.presalesBundle.findFirst({
    where: {
      id: bundleId,
      ...(user.organizationId ? { organizationId: user.organizationId } : {}),
    },
  });
  if (!bundle) return err('NOT_FOUND', 'Bundle not found.', 404);
  if (bundle.signedAt) {
    return err(
      'BUNDLE_SIGNED',
      'Signed bundles cannot be revoked. Submit a change request instead.',
      409,
    );
  }
  if (bundle.revokedAt) return err('BUNDLE_ALREADY_REVOKED', 'Bundle is already revoked.', 409);

  const form = await req.formData();
  const reason = String(form.get('reason') ?? '').trim();
  if (!reason) {
    return err('REASON_REQUIRED', 'A revocation reason is required for audit traceability.', 400);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.presalesBundle.update({
      where: { id: bundleId },
      data: { revokedAt: now, revokedBy: user.id, revokedReason: reason },
    }),
    prisma.presalesAuditEvent.create({
      data: {
        bundleId,
        actorUserId: user.id,
        eventType: 'bundle_revoked',
        payload: { reason, reasonLength: reason.length },
      },
    }),
  ]);

  return redirect(req, `/presales/${bundleId}`);
}
