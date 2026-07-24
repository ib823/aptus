/**
 * POST /api/presales/change-requests — post-signoff change request.
 *
 * Captures the description + priority, writes a ChangeRequest tied to the
 * underlying Assessment, audits the action. Routing to a consultant
 * review queue is a follow-up; v1 is capture + audit only.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { canPerformPresalesAction, lacksTenantScope } from '@/lib/presales/rbac';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  if (!canPerformPresalesAction(user.role, 'submit_change_request')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }
  if (lacksTenantScope(user)) return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });

  const form = await req.formData();
  const bundleId = String(form.get('bundleId') ?? '');
  const assessmentId = String(form.get('assessmentId') ?? '');
  const description = String(form.get('description') ?? '').trim();
  const priority = String(form.get('priority') ?? 'standard');

  if (!bundleId || !assessmentId || !description) {
    return NextResponse.json({ error: { code: 'MISSING_FIELDS' } }, { status: 400 });
  }

  const bundle = await prisma.presalesBundle.findFirst({
    where: { id: bundleId, ...(user.organizationId ? { organizationId: user.organizationId } : {}) },
    select: { id: true, signedAt: true, assessmentId: true },
  });
  if (!bundle) return NextResponse.json({ error: { code: 'BUNDLE_NOT_FOUND' } }, { status: 404 });
  if (!bundle.signedAt) {
    return NextResponse.json({ error: { code: 'BUNDLE_NOT_SIGNED' } }, { status: 409 });
  }

  // v1 scope: capture + audit only. The ChangeRequest model requires
  // a previousSnapshotId and impactSummary (Assessment-level snapshot
  // machinery) that's beyond the presales scope here — full integration
  // with the Assessment change workflow is a follow-up. For now, the audit
  // event is the durable record.
  await prisma.presalesAuditEvent.create({
    data: {
      bundleId,
      actorUserId: user.id,
      eventType: 'change_request_submitted',
      payload: {
        priority,
        description,
        descriptionLength: description.length,
        assessmentId,
      },
    },
  });

  return NextResponse.redirect(new URL(`/presales/${bundleId}`, req.url), { status: 303 });
}
