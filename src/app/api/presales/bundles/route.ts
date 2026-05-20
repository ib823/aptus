/**
 * POST /api/presales/bundles — consultant creates a presales bundle.
 *
 * Validates RBAC, snapshots scope content (deep-copy of ScopeItemContent[]
 * for each selected code), creates grants, optionally fires the
 * grant_created + magic-link send for each grant when action=send, marks
 * bundle_sent in the audit log for the same case.
 *
 * On action=save_draft: bundle stored without grants. Branding fields
 * mutable until bundle_sent.
 *
 * Stakeholder format: "email - displayName - SIGNATORY?" one per line.
 */

import { createHash, randomBytes } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { scopeItems } from '@/lib/fts/data';
import { dispatchEmail, renderMagicLinkEmail } from '@/lib/presales/emails';
import { canPerformPresalesAction } from '@/lib/presales/rbac';
import type { ScopeItemContent } from '@/lib/fts/types';

interface ParsedStakeholder {
  email: string;
  displayName: string;
  isSignatory: boolean;
}

function parseStakeholders(raw: string): ParsedStakeholder[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('-').map((s) => s.trim());
      const email = parts[0] ?? '';
      const displayName = parts[1] ?? email;
      const isSignatory = parts[2]?.toUpperCase().includes('SIGNATORY') ?? false;
      return { email, displayName, isSignatory };
    })
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email));
}

function publicAppOrigin(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    new URL(req.url).origin
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  if (!canPerformPresalesAction(user.role, 'create_bundle')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }
  if (!user.organizationId) {
    return NextResponse.json({ error: { code: 'NO_ORG' } }, { status: 400 });
  }

  const form = await req.formData();
  const action = String(form.get('action') ?? 'save_draft');
  const name = String(form.get('name') ?? '').trim();
  const assessmentId = String(form.get('assessmentId') ?? '').trim();
  const clientCompanyName = String(form.get('clientCompanyName') ?? '').trim();
  const clientAccentColor = String(form.get('clientAccentColor') ?? '').trim() || null;
  const clientLogoUrl = String(form.get('clientLogoUrl') ?? '').trim() || null;
  const scopeCodesRaw = form.getAll('scopeCodes').map(String);
  const defaultScopeCode = String(form.get('defaultScopeCode') ?? '').trim();
  const stakeholdersRaw = String(form.get('stakeholders') ?? '');
  const startsAt = new Date(String(form.get('startsAt') ?? ''));
  const expiresAt = new Date(String(form.get('expiresAt') ?? ''));
  const acknowledgementTextVersion = String(form.get('acknowledgementTextVersion') ?? 'v1');
  const pdpaNoticeTextVersion = String(form.get('pdpaNoticeTextVersion') ?? 'v1');

  if (!name || !assessmentId || !clientCompanyName) {
    return NextResponse.json({ error: { code: 'MISSING_FIELDS' } }, { status: 400 });
  }
  if (scopeCodesRaw.length === 0) {
    return NextResponse.json({ error: { code: 'NO_SCOPES' } }, { status: 400 });
  }
  if (!scopeCodesRaw.includes(defaultScopeCode)) {
    return NextResponse.json({ error: { code: 'DEFAULT_SCOPE_NOT_IN_LIST' } }, { status: 400 });
  }
  if (isNaN(startsAt.getTime()) || isNaN(expiresAt.getTime()) || expiresAt <= startsAt) {
    return NextResponse.json({ error: { code: 'INVALID_WINDOW' } }, { status: 400 });
  }

  // Confirm the assessment belongs to this org.
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!assessment) return NextResponse.json({ error: { code: 'ASSESSMENT_NOT_FOUND' } }, { status: 404 });

  // Snapshot the scope content. Deep-copy via structured clone — these are
  // the IP-bearing fields that the redaction layer strips for external
  // surfaces; storing them here is the consultant copy.
  const snapshot: ScopeItemContent[] = [];
  for (const code of scopeCodesRaw) {
    const item = scopeItems[code];
    if (!item) {
      return NextResponse.json(
        { error: { code: 'UNKNOWN_SCOPE', message: `Scope ${code} not in catalog` } },
        { status: 400 },
      );
    }
    snapshot.push(JSON.parse(JSON.stringify(item)));
  }

  const stakeholders = parseStakeholders(stakeholdersRaw);
  const signatoryCount = stakeholders.filter((s) => s.isSignatory).length;
  if (stakeholders.length === 0) {
    return NextResponse.json({ error: { code: 'NO_STAKEHOLDERS' } }, { status: 400 });
  }
  if (signatoryCount === 0) {
    return NextResponse.json({ error: { code: 'NO_SIGNATORY' } }, { status: 400 });
  }
  if (signatoryCount > 1) {
    return NextResponse.json(
      { error: { code: 'MULTIPLE_SIGNATORIES', message: 'At most one stakeholder may be marked SIGNATORY' } },
      { status: 400 },
    );
  }

  // Create the bundle.
  const bundle = await prisma.presalesBundle.create({
    data: {
      name,
      assessmentId,
      organizationId: user.organizationId,
      createdBy: user.id,
      scopeCodes: scopeCodesRaw,
      defaultScopeCode,
      contentSnapshotJson: snapshot as unknown as object,
      clientCompanyName,
      clientAccentColor,
      clientLogoUrl,
      startsAt,
      expiresAt,
      acknowledgementTextVersion,
      pdpaNoticeTextVersion,
    },
  });

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: bundle.id,
      actorUserId: user.id,
      eventType: 'bundle_created',
      payload: { stakeholderCount: stakeholders.length, scopeCodes: scopeCodesRaw },
    },
  });

  // Create grants. The raw token is generated here and survives only in
  // the URL we email; only the SHA-256 hash is stored.
  const grants: Array<{ id: string; rawToken: string; email: string; displayName: string }> = [];
  for (const s of stakeholders) {
    const rawToken = `pst_${randomBytes(24).toString('hex')}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const grant = await prisma.presalesAccessGrant.create({
      data: {
        bundleId: bundle.id,
        email: s.email,
        displayName: s.displayName,
        canSignOff: s.isSignatory,
        tokenHash,
        startsAt,
        expiresAt,
      },
    });
    await prisma.presalesAuditEvent.create({
      data: {
        bundleId: bundle.id,
        grantId: grant.id,
        actorUserId: user.id,
        eventType: 'grant_created',
        payload: { email: s.email, canSignOff: s.isSignatory },
      },
    });
    grants.push({ id: grant.id, rawToken, email: s.email, displayName: s.displayName });
  }

  // If "Send invitations": dispatch the magic-link email per grant and
  // write the bundle_sent audit row. The bundle becomes immutable
  // (R1 snapshot lock) once this is written.
  if (action === 'send') {
    const origin = publicAppOrigin(req);
    for (const g of grants) {
      const link = `${origin}/c/${encodeURIComponent(g.rawToken)}`;
      await dispatchEmail(
        renderMagicLinkEmail({
          recipientName: g.displayName,
          recipientEmail: g.email,
          clientCompanyName,
          consultantName: user.name ?? user.email,
          linkUrl: link,
          expiresAtIso: expiresAt.toISOString(),
          acknowledgementVersion: acknowledgementTextVersion,
        }),
        { bestEffort: true },
      );
    }
    await prisma.presalesAuditEvent.create({
      data: {
        bundleId: bundle.id,
        actorUserId: user.id,
        eventType: 'bundle_sent',
        payload: { grantCount: grants.length },
      },
    });
  }

  return NextResponse.redirect(new URL(`/presales/${bundle.id}`, req.url), { status: 303 });
}
