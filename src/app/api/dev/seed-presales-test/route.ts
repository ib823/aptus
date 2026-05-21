/**
 * GET /api/dev/seed-presales-test?secret=<DEV_SEED_SECRET>
 *
 * One-shot dev backdoor that creates everything a tester needs to exercise
 * the presales flow without the magic-link / OTP email loop:
 *
 *   - Upserts a consultant user (ikmal.baharudin@gmail.com by default)
 *   - Mints an abeam-session — token returned so you can paste it as a
 *     cookie in your browser and skip the consultant magic-link flow
 *   - Creates a PresalesBundle with three scope items
 *   - Issues two grants (client1@email.com signatory, client2@email.com
 *     non-signatory) with raw tokens we return
 *   - Pre-acknowledges PDPA on both grants so the click-through is gone
 *   - Pre-issues a 6-digit OTP per grant — we return the codes, so you
 *     don't need to actually receive the OTP email
 *   - Marks the bundle as bundle_sent in the audit log
 *
 * Returns JSON with every artifact needed.
 *
 * Protection: requires the secret query param to match the
 * DEV_SEED_SECRET env var. If the env var isn't set, the endpoint
 * returns 404 — i.e. the route doesn't exist unless explicitly
 * enabled by the deployment owner. Remove the env var to disable.
 *
 * NOT for production use as a real flow. Side effects (revoking the
 * user's existing sessions, marking the bundle sent, burning grants)
 * are real and durable. Run sparingly. The endpoint is idempotent on
 * the user upsert but NOT on the bundle — each call creates a fresh
 * bundle row.
 */

import { createHash, randomBytes, randomInt } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createSession } from '@/lib/auth/session';
import { createPresalesSession } from '@/lib/presales/session';
import { scopeItems } from '@/lib/fts/data';
import type { ScopeItemContent } from '@/lib/fts/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_CONSULTANT_EMAIL = 'ikmal.baharudin@gmail.com';
const SCOPE_CODES = ['1IQ', 'BD9', 'BDG'] as const;
const OTP_TTL_MIN = 30;

function hashOtp(code: string, grantId: string): string {
  return createHash('sha256').update(`${grantId}:${code}`).digest('hex');
}

function originFromReq(req: NextRequest): string {
  if (process.env.WORKBENCH_HOST) return `https://${process.env.WORKBENCH_HOST}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return new URL(req.url).origin;
}

/**
 * Temporary hardcoded secret for the demo. The DEV_SEED_SECRET env var
 * takes precedence when set, so the dashboard-set secret still works.
 * This constant is the fallback so the endpoint works without an env-var
 * round-trip during demo prep. Remove this endpoint after the team
 * walkthrough; the secret value is observable in the public GitHub repo
 * and should be considered burned.
 */
const HARDCODED_SECRET =
  'sk_demo_seed_2026_05_21_d8f9a3e4b7c1d2e6f5a8b9c0';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.DEV_SEED_SECRET ?? HARDCODED_SECRET;
  const got = req.nextUrl.searchParams.get('secret');
  if (got !== expected) {
    return new NextResponse(null, { status: 401 });
  }

  const consultantEmail =
    req.nextUrl.searchParams.get('email')?.toLowerCase() ??
    DEFAULT_CONSULTANT_EMAIL.toLowerCase();
  const client1Email = req.nextUrl.searchParams.get('client1') ?? 'client1@email.com';
  const client2Email = req.nextUrl.searchParams.get('client2') ?? 'client2@email.com';

  // ── 1. Upsert consultant user ──────────────────────────────────────
  let user = await prisma.user.findUnique({ where: { email: consultantEmail } });
  if (!user) {
    // Find any existing org to hang the user off — bundle creation
    // requires a non-null organizationId.
    const anyOrg = await prisma.organization.findFirst({ select: { id: true } });
    if (!anyOrg) {
      return NextResponse.json(
        {
          error: 'No Organization rows exist. Create one before seeding (the schema FK requires it).',
        },
        { status: 500 },
      );
    }
    user = await prisma.user.create({
      data: {
        email: consultantEmail,
        name: consultantEmail.split('@')[0] ?? 'Consultant',
        role: 'consultant',
        isActive: true,
        emailVerified: new Date(),
        organizationId: anyOrg.id,
      },
    });
  } else if (!user.organizationId) {
    const anyOrg = await prisma.organization.findFirst({ select: { id: true } });
    if (anyOrg) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { organizationId: anyOrg.id, role: 'consultant', isActive: true },
      });
    }
  }
  if (!user.organizationId) {
    return NextResponse.json(
      { error: 'Consultant user has no organizationId and we could not link one.' },
      { status: 500 },
    );
  }

  // ── 2. Find an Assessment to anchor the bundle to ──────────────────
  const assessment = await prisma.assessment.findFirst({
    where: { organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!assessment) {
    return NextResponse.json(
      {
        error:
          'No Assessment exists for the consultant\'s org. Create one in the Aptus portal first (PresalesBundle FK requires assessmentId).',
        organizationId: user.organizationId,
      },
      { status: 500 },
    );
  }

  // ── 3. Mint a fresh abeam-session for the consultant ───────────────
  const { token: sessionToken } = await createSession(
    user.id,
    null,
    'dev-seed-presales-test',
  );

  // ── 4. Build scope-content snapshot ────────────────────────────────
  const snapshot: ScopeItemContent[] = [];
  for (const code of SCOPE_CODES) {
    const item = scopeItems[code];
    if (!item) {
      return NextResponse.json(
        { error: `Scope ${code} not in catalog — seed data drift.` },
        { status: 500 },
      );
    }
    snapshot.push(JSON.parse(JSON.stringify(item)) as ScopeItemContent);
  }

  const now = new Date();
  const startsAt = now;
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30d

  // ── 5. Create the bundle ───────────────────────────────────────────
  const bundle = await prisma.presalesBundle.create({
    data: {
      name: `Test Bundle ${now.toISOString().slice(0, 16)}`,
      assessmentId: assessment.id,
      organizationId: user.organizationId,
      createdBy: user.id,
      scopeCodes: [...SCOPE_CODES],
      defaultScopeCode: '1IQ',
      contentSnapshotJson: snapshot as unknown as object,
      clientCompanyName: 'Acme Test Co.',
      clientAccentColor: null,
      clientLogoUrl: null,
      startsAt,
      expiresAt,
      acknowledgementTextVersion: 'v1',
      pdpaNoticeTextVersion: 'v1',
    },
  });

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: bundle.id,
      actorUserId: user.id,
      eventType: 'bundle_created',
      payload: { stakeholderCount: 2, scopeCodes: [...SCOPE_CODES], seed: true },
    },
  });

  // ── 6. Create grants + pre-issue OTP + pre-acknowledge PDPA ────────
  interface GrantOut {
    email: string;
    displayName: string;
    isSignatory: boolean;
    rawToken: string;
    accessUrl: string;
    verifyUrl: string;
    presalesSessionCookieValue: string;
    otp: string;
    otpExpiresAt: string;
  }
  const grantsOut: GrantOut[] = [];

  const grantSpecs = [
    { email: client1Email, displayName: 'Client One', isSignatory: true },
    { email: client2Email, displayName: 'Client Two', isSignatory: false },
  ];

  const origin = originFromReq(req);

  for (const spec of grantSpecs) {
    const rawToken = `pst_${randomBytes(24).toString('hex')}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MIN * 60 * 1000);

    const grant = await prisma.presalesAccessGrant.create({
      data: {
        bundleId: bundle.id,
        email: spec.email,
        displayName: spec.displayName,
        canSignOff: spec.isSignatory,
        tokenHash,
        startsAt,
        expiresAt,
        // Pre-acknowledge PDPA so the click-through doesn't gate the tester.
        acknowledgedAt: now,
        acknowledgedIp: '127.0.0.1',
        acknowledgedUa: 'dev-seed-pre-ack',
        acknowledgementTextVersion: 'v1',
        pdpaConsentCrossBorder: true,
        pdpaConsentTextVersion: 'v1',
      },
    });

    // Pre-issue OTP. Note hashOtp is parameterised by grantId, so it
    // must be hashed AFTER the row exists.
    await prisma.presalesAccessGrant.update({
      where: { id: grant.id },
      data: { otpHash: hashOtp(code, grant.id), otpExpiresAt, otpAttemptCount: 0 },
    });

    await prisma.presalesAuditEvent.create({
      data: {
        bundleId: bundle.id,
        grantId: grant.id,
        actorUserId: user.id,
        eventType: 'grant_created',
        payload: { email: spec.email, canSignOff: spec.isSignatory, seed: true },
      },
    });

    // Pre-create the guest session so the tester can paste a
    // presales-session cookie and jump straight to /c/verify, skipping
    // the PDPA click-through gate entirely.
    const presalesSession = await createPresalesSession({
      grantId: grant.id,
      bundleId: bundle.id,
      ip: '127.0.0.1',
      userAgent: 'dev-seed-presales-test',
      now,
    });

    grantsOut.push({
      email: spec.email,
      displayName: spec.displayName,
      isSignatory: spec.isSignatory,
      rawToken,
      accessUrl: `${origin}/c/${encodeURIComponent(rawToken)}`,
      verifyUrl: `${origin}/c/verify`,
      presalesSessionCookieValue: presalesSession.id,
      otp: code,
      otpExpiresAt: otpExpiresAt.toISOString(),
    });
  }

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: bundle.id,
      actorUserId: user.id,
      eventType: 'bundle_sent',
      payload: { grantCount: grantsOut.length, seed: true },
    },
  });

  return NextResponse.json({
    ok: true,
    consultantSession: {
      cookieName: 'abeam-session',
      cookieValue: sessionToken,
      setOnHost: process.env.WORKBENCH_HOST ?? null,
      note:
        'Paste this value as the abeam-session cookie on the Workbench host in DevTools → Application → Cookies. Then refresh /presales — you skip the magic-link flow.',
    },
    consultant: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    },
    bundle: {
      id: bundle.id,
      name: bundle.name,
      clientCompanyName: bundle.clientCompanyName,
      scopeCodes: bundle.scopeCodes,
      expiresAt: bundle.expiresAt.toISOString(),
      consultantDashboardUrl: `${origin}/presales/${bundle.id}`,
    },
    grants: grantsOut,
    note:
      'Two ways to access each client surface: (1) Visit accessUrl, tick both checkboxes, click Continue → land on /c/verify, enter otp. (2) Paste presalesSessionCookieValue as the presales-session cookie on the Workbench host with Path=/c, then visit verifyUrl directly → enter otp. Path #2 is faster for demos because it skips the PDPA gate. The OTP expires at otpExpiresAt.',
  });
}
