/**
 * POST /api/presales/bundles/[bundleId]/branding — consultant edits the
 * client-facing branding fields (clientCompanyName, clientAccentColor,
 * clientLogoUrl). Permitted only while the bundle is in DRAFT state — once
 * bundle_sent has fired, branding (and everything else) locks per R1.
 *
 * Writes the bundle_branding_updated audit event (R4) with a diff payload.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { assertBundleDraft, SnapshotLockedError } from '@/lib/presales/guards';
import { canPerformPresalesAction, lacksTenantScope } from '@/lib/presales/rbac';

interface RouteCtx {
  params: Promise<{ bundleId: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  if (!canPerformPresalesAction(user.role, 'edit_bundle_draft')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }
  if (lacksTenantScope(user)) return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });

  const { bundleId } = await ctx.params;
  const bundle = await prisma.presalesBundle.findFirst({
    where: { id: bundleId, ...(user.organizationId ? { organizationId: user.organizationId } : {}) },
  });
  if (!bundle) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });

  try {
    await assertBundleDraft(prisma, bundleId);
  } catch (err) {
    if (err instanceof SnapshotLockedError) {
      return NextResponse.json({ error: { code: err.code } }, { status: 409 });
    }
    throw err;
  }

  const form = await req.formData();
  const clientCompanyName = String(form.get('clientCompanyName') ?? '').trim();
  const clientAccentColor = String(form.get('clientAccentColor') ?? '').trim() || null;
  const clientLogoUrl = String(form.get('clientLogoUrl') ?? '').trim() || null;

  if (!clientCompanyName) {
    return NextResponse.json({ error: { code: 'MISSING_FIELDS' } }, { status: 400 });
  }

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (bundle.clientCompanyName !== clientCompanyName) {
    diff.clientCompanyName = { from: bundle.clientCompanyName, to: clientCompanyName };
  }
  if (bundle.clientAccentColor !== clientAccentColor) {
    diff.clientAccentColor = { from: bundle.clientAccentColor, to: clientAccentColor };
  }
  if (bundle.clientLogoUrl !== clientLogoUrl) {
    diff.clientLogoUrl = { from: bundle.clientLogoUrl, to: clientLogoUrl };
  }
  if (Object.keys(diff).length === 0) {
    return NextResponse.redirect(new URL(`/presales/${bundleId}`, req.url), { status: 303 });
  }

  await prisma.presalesBundle.update({
    where: { id: bundleId },
    data: { clientCompanyName, clientAccentColor, clientLogoUrl },
  });

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId,
      actorUserId: user.id,
      eventType: 'bundle_branding_updated',
      payload: { diff } as unknown as object,
    },
  });

  return NextResponse.redirect(new URL(`/presales/${bundleId}`, req.url), { status: 303 });
}
