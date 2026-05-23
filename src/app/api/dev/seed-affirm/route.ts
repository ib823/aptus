/**
 * GET /api/dev/seed-affirm?secret=<DEV_AFFIRM_SEED_SECRET>
 *
 * One-shot dev backdoor for the value-stream affirm-set workbench
 * (commit eb823df). Sister of /api/dev/seed-presales-test. What it does:
 *
 *   1. Seeds the value-stream master data — 8 streams, 55 sub-processes,
 *      672 scope items, 150 L2 questions. Idempotent (per-row upserts).
 *
 *   2. Upserts FOUR demo users:
 *
 *      Real-email pair (NextAuth magic link emails are dispatched):
 *        ibaharudin@abeam.com   — consultant
 *        ikmls@hotmail.com      — client (a regular logged-in user)
 *
 *      Bypass pair (no email round-trip; live abeam-session minted and
 *      returned for paste, plus a one-click ?as= activate URL):
 *        cons@email.com         — consultant
 *        client2@email.com      — client
 *
 *   3. Creates one demo AffirmBundle in ISSUED state owned by
 *      cons@email.com, scoped to all "Lead to Cash" items, so the
 *      client personas can immediately try /affirm/[id].
 *
 *   4. Returns a JSON payload with everything a tester needs.
 *
 * Activate modes (skip the consultant magic-link flow entirely):
 *   ?as=cons      → set abeam-session cookie for cons@email.com,
 *                   303 redirect to /affirm
 *   ?as=client2   → set abeam-session cookie for client2@email.com,
 *                   303 redirect to /affirm/<demo-bundle-id>
 *
 * Protection: requires the secret query param to match. The hard-coded
 * fallback below is a demo expedient and is observable in this public
 * repo — set DEV_AFFIRM_SEED_SECRET in Vercel to rotate. Remove this
 * route after the team walkthrough.
 *
 * NOT a production flow. Each call upserts users + seeds data, and the
 * bundle creation is idempotent on a stable key per-session (we reuse a
 * demo bundle named "DEMO · Lead to Cash" instead of piling up rows).
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { sendMagicLink } from "@/lib/auth/send-magic-link";
import dataset from "../../../../../prisma/seeds/value-stream/dataset.json";
import processFlowDataset from "../../../../../prisma/seeds/value-stream/process-flow.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Hardcoded fallback so the endpoint works without an env-var deploy
// round-trip during demo prep. DEV_AFFIRM_SEED_SECRET overrides when set;
// rotate by setting that env var in Vercel and the constant becomes inert.
const HARDCODED_SECRET = "sk_demo_affirm_2026_05_22_a4f8b2c1e6d9f3a7b8c2";

const EMAILS = {
  realConsultant: "ibaharudin@abeam.com",
  realClient: "ikmls@hotmail.com",
  bypassConsultant: "cons@email.com",
  bypassClient: "client2@email.com",
} as const;

const DEMO_BUNDLE_NAME = "DEMO · Lead to Cash";

function originFromReq(req: NextRequest): string {
  if (process.env.WORKBENCH_HOST) return `https://${process.env.WORKBENCH_HOST}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return new URL(req.url).origin;
}

interface UpsertedUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

async function upsertUser(
  email: string,
  role: "consultant" | "client",
  orgId: string | null,
): Promise<UpsertedUser> {
  const e = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: e } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role,
        isActive: true,
        emailVerified: existing.emailVerified ?? new Date(),
        ...(orgId && !existing.organizationId ? { organizationId: orgId } : {}),
      },
    });
    return { id: updated.id, email: updated.email, name: updated.name, role: updated.role };
  }
  const created = await prisma.user.create({
    data: {
      email: e,
      name: e.split("@")[0] ?? "User",
      role,
      isActive: true,
      emailVerified: new Date(),
      ...(orgId ? { organizationId: orgId } : {}),
    },
  });
  return { id: created.id, email: created.email, name: created.name, role: created.role };
}

// ─── Value-stream master data ───────────────────────────────────────
// Inlined from prisma/seeds/value-stream/index.ts — same upsert logic,
// loaded via static JSON import so the route bundle is self-contained.

interface ValueStreamSeed {
  id: string;
  name: string;
  isFoundation: boolean;
  displayOrder: number;
}
interface SubProcessSeed {
  id: string;
  streamId: string;
  name: string;
  type: string;
  displayOrder: number;
}
interface ScopeItemSeed {
  id: string;
  subProcessId: string;
  streamId: string;
  description: string;
  sapBusinessArea: string | null;
  hasBdcCoverage: boolean;
  placementReviewFlag: string | null;
}
interface QuestionSeed {
  id: string;
  streamId: string;
  subProcessId: string;
  scopeItemRefs: string[];
  sapVerbatim: string | null;
  plainLanguageSuggested: string | null;
  consultantWording: string | null;
  sapArea: string | null;
  sapTopic: string | null;
  sscuiRef: string | null;
  sourceQuestionnaire: string | null;
  placementBasis: string | null;
  status: string;
  flag: string | null;
  statusNote: string | null;
  displayOrder: number;
  // v2.1 (Standard-Answer-Layer)
  aboutText?: string | null;
  format?: "decision" | "information";
}
interface Dataset {
  meta: { counts: Record<string, number> };
  valueStreams: ValueStreamSeed[];
  subProcesses: SubProcessSeed[];
  scopeItems: ScopeItemSeed[];
  questions: QuestionSeed[];
}

async function seedValueStream(): Promise<{
  streams: number;
  subProcesses: number;
  scopeItems: number;
  questions: number;
  excluded: number;
  flagged: number;
}> {
  const data = dataset as unknown as Dataset;

  for (const s of data.valueStreams) {
    await prisma.affirmValueStream.upsert({
      where: { id: s.id },
      update: { name: s.name, isFoundation: s.isFoundation, displayOrder: s.displayOrder },
      create: s,
    });
  }
  for (const sp of data.subProcesses) {
    await prisma.affirmSubProcess.upsert({
      where: { id: sp.id },
      update: {
        streamId: sp.streamId,
        name: sp.name,
        type: sp.type,
        displayOrder: sp.displayOrder,
      },
      create: sp,
    });
  }
  for (const si of data.scopeItems) {
    await prisma.affirmScopeItem.upsert({
      where: { id: si.id },
      update: {
        subProcessId: si.subProcessId,
        streamId: si.streamId,
        description: si.description,
        sapBusinessArea: si.sapBusinessArea,
        hasBdcCoverage: si.hasBdcCoverage,
        placementReviewFlag: si.placementReviewFlag,
      },
      create: si,
    });
  }
  for (const q of data.questions) {
    const common = {
      streamId: q.streamId,
      subProcessId: q.subProcessId,
      scopeItemRefs: q.scopeItemRefs,
      sapVerbatim: q.sapVerbatim,
      plainLanguageSuggested: q.plainLanguageSuggested,
      consultantWording: q.consultantWording,
      sapArea: q.sapArea,
      sapTopic: q.sapTopic,
      sscuiRef: q.sscuiRef,
      sourceQuestionnaire: q.sourceQuestionnaire,
      placementBasis: q.placementBasis,
      status: q.status,
      flag: q.flag,
      statusNote: q.statusNote,
      displayOrder: q.displayOrder,
      // v2.1 (Standard-Answer-Layer):
      aboutText: q.aboutText ?? null,
      format: q.format ?? "decision",
    };
    await prisma.affirmQuestion.upsert({
      where: { id: q.id },
      update: common,
      create: { id: q.id, ...common },
    });
  }

  const [streams, subs, items, questions, excluded, flagged] = await Promise.all([
    prisma.affirmValueStream.count(),
    prisma.affirmSubProcess.count(),
    prisma.affirmScopeItem.count(),
    prisma.affirmQuestion.count(),
    prisma.affirmQuestion.count({ where: { status: "excluded" } }),
    prisma.affirmQuestion.count({ where: { flag: "config-how-to" } }),
  ]);

  return { streams, subProcesses: subs, scopeItems: items, questions, excluded, flagged };
}

// ─── Process-flow seed (Layer 3, MY 2602) ────────────────────────────
// 655 of 672 scope items have an MY-mandatory flow; ~2502 step rows
// total. Data-only landing — UI lands once the aligned design ships.

interface ProcessFlowSeed {
  scopeItemId: string;
  activityCount: number;
  myStepCount: number;
  optionalCount: number;
}
interface ProcessStepSeed {
  scopeItemId: string;
  stepNumber: number;
  activity: string;
  fioriApps: string[];
}
interface ProcessFlowDataset {
  meta: { country: string; sapRelease: string; counts: Record<string, number> };
  flows: ProcessFlowSeed[];
  steps: ProcessStepSeed[];
}

async function seedProcessFlow(): Promise<{ flows: number; steps: number }> {
  const data = processFlowDataset as unknown as ProcessFlowDataset;
  for (const f of data.flows) {
    await prisma.affirmProcessFlow.upsert({
      where: { scopeItemId: f.scopeItemId },
      update: {
        activityCount: f.activityCount,
        myStepCount: f.myStepCount,
        optionalCount: f.optionalCount,
        country: data.meta.country,
        sapRelease: data.meta.sapRelease,
      },
      create: {
        scopeItemId: f.scopeItemId,
        activityCount: f.activityCount,
        myStepCount: f.myStepCount,
        optionalCount: f.optionalCount,
        country: data.meta.country,
        sapRelease: data.meta.sapRelease,
      },
    });
  }
  // Replace steps per flow (unique key is (scopeItemId, stepNumber); a
  // re-extract could reorder, so wipe-then-insert is the safe path).
  const stepsByFlow = new Map<string, ProcessStepSeed[]>();
  for (const s of data.steps) {
    const arr = stepsByFlow.get(s.scopeItemId) ?? [];
    arr.push(s);
    stepsByFlow.set(s.scopeItemId, arr);
  }
  for (const [scopeItemId, rows] of stepsByFlow) {
    await prisma.affirmProcessStep.deleteMany({ where: { scopeItemId } });
    if (rows.length === 0) continue;
    await prisma.affirmProcessStep.createMany({
      data: rows.map((r) => ({
        scopeItemId: r.scopeItemId,
        stepNumber: r.stepNumber,
        activity: r.activity,
        fioriApps: r.fioriApps,
      })),
    });
  }
  const [flowCount, stepCount] = await Promise.all([
    prisma.affirmProcessFlow.count(),
    prisma.affirmProcessStep.count(),
  ]);
  return { flows: flowCount, steps: stepCount };
}

// ─── Demo bundle ─────────────────────────────────────────────────────

async function ensureDemoBundle(ownerId: string): Promise<{
  id: string;
  client: string;
  state: string;
  scopeCount: number;
  questionCount: number;
  created: boolean;
  refreshed: boolean;
}> {
  const existing = await prisma.affirmBundle.findFirst({
    where: { client: DEMO_BUNDLE_NAME },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { scopeItems: true, questions: true } },
      questions: { select: { questionId: true, enabled: true } },
    },
  });

  if (existing) {
    // v2.1: refresh the join rows so the latest SAP defaults (format
    // from Standard-Answer-Layer, enabled flips on excluded rows) take
    // effect on the demo bundle without the consultant having to wipe
    // anything. Preserves any consultant overrides? — no, this is a
    // demo bundle and the seed always wins. If a non-demo bundle is
    // ever named "DEMO · Lead to Cash" by accident, that's on the
    // operator.
    const scopeIds = await prisma.affirmBundleScopeItem
      .findMany({
        where: { bundleId: existing.id },
        select: { scopeItemId: true },
      })
      .then((rows) => rows.map((r) => r.scopeItemId));

    const inScope = scopeIds.length
      ? await prisma.affirmQuestion.findMany({
          where: { scopeItemRefs: { hasSome: scopeIds } },
          select: { id: true, status: true, displayOrder: true, format: true },
        })
      : [];

    await prisma.$transaction(async (tx) => {
      await tx.affirmBundleQuestion.deleteMany({ where: { bundleId: existing.id } });
      if (inScope.length) {
        await tx.affirmBundleQuestion.createMany({
          data: inScope.map((q) => ({
            bundleId: existing.id,
            questionId: q.id,
            enabled: q.status !== "excluded",
            displayOrder: q.displayOrder,
            format: q.format,
          })),
        });
      }
      // Also wipe answers — they're keyed to old join rows by stale
      // SAP defaults; the demo bundle is meant to be re-test-able.
      await tx.affirmResponse.deleteMany({ where: { bundleId: existing.id } });
      // Rewind state to issued so the client view is open again.
      await tx.affirmBundle.update({
        where: { id: existing.id },
        data: { state: "issued", submittedAt: null, releasedAt: null, releasedById: null },
      });
      await tx.affirmEvent.create({
        data: {
          bundleId: existing.id,
          type: "seed_refresh",
          actorId: ownerId,
          payload: { questionCount: inScope.length, seed: true },
        },
      });
    });

    return {
      id: existing.id,
      client: existing.client,
      state: "issued",
      scopeCount: existing._count.scopeItems,
      questionCount: inScope.length,
      created: false,
      refreshed: true,
    };
  }

  // Build a fresh demo bundle scoped to all Lead to Cash items.
  const scope = await prisma.affirmScopeItem.findMany({
    where: { streamId: "lead-to-cash" },
    select: { id: true },
  });

  const bundle = await prisma.$transaction(async (tx) => {
    const b = await tx.affirmBundle.create({
      data: {
        client: DEMO_BUNDLE_NAME,
        state: "draft",
        createdById: ownerId,
      },
    });
    if (scope.length) {
      await tx.affirmBundleScopeItem.createMany({
        data: scope.map((s) => ({ bundleId: b.id, scopeItemId: s.id })),
        skipDuplicates: true,
      });
    }
    await tx.affirmEvent.create({
      data: {
        bundleId: b.id,
        type: "bundle_created",
        actorId: ownerId,
        payload: { scopeCount: scope.length, seed: true },
      },
    });

    // Issue immediately so the client view is open for the demo.
    const scopeIds = scope.map((s) => s.id);
    const questions = scopeIds.length
      ? await tx.affirmQuestion.findMany({
          where: { scopeItemRefs: { hasSome: scopeIds } },
          select: { id: true, status: true, displayOrder: true, format: true },
        })
      : [];
    if (questions.length) {
      await tx.affirmBundleQuestion.createMany({
        data: questions.map((q) => ({
          bundleId: b.id,
          questionId: q.id,
          enabled: q.status !== "excluded",
          displayOrder: q.displayOrder,
          format: q.format,
        })),
        skipDuplicates: true,
      });
    }
    const issued = await tx.affirmBundle.update({
      where: { id: b.id },
      data: { state: "issued", issuedAt: new Date() },
    });
    await tx.affirmEvent.create({
      data: {
        bundleId: b.id,
        type: "issued",
        actorId: ownerId,
        payload: { questionCount: questions.length, seed: true },
      },
    });
    return { bundle: issued, scope, questions };
  });

  return {
    id: bundle.bundle.id,
    client: bundle.bundle.client,
    state: bundle.bundle.state,
    scopeCount: bundle.scope.length,
    questionCount: bundle.questions.length,
    created: true,
    refreshed: false,
  };
}

// ─── Handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.DEV_AFFIRM_SEED_SECRET ?? HARDCODED_SECRET;
  const got = req.nextUrl.searchParams.get("secret");
  if (got !== expected) return new NextResponse(null, { status: 401 });

  try {
    return await handle(req, expected);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[seed-affirm] failed:", message, stack);
    // Surface the failure inline so callers can debug without a log
    // round-trip. This endpoint is secret-gated and dev-only.
    return NextResponse.json(
      {
        ok: false,
        error: "seed_failed",
        message,
        stack: stack?.split("\n").slice(0, 8).join("\n"),
      },
      { status: 500 },
    );
  }
}

async function handle(req: NextRequest, expected: string): Promise<NextResponse> {
  // Find any existing org to associate users with (User.organizationId is
  // nullable but downstream RBAC reads it; preferable to set it).
  const anyOrg = await prisma.organization.findFirst({ select: { id: true } });
  const orgId = anyOrg?.id ?? null;

  // 1. Master data
  const counts = await seedValueStream();
  // 1b. Layer-3 process flow (MY 2602). Data-only landing — the
  // <ProcessFlowStrip /> UI lands in a follow-up once the aligned
  // design ships through Claude design.
  const flowCounts = await seedProcessFlow();

  // 2. Users
  const realConsultant = await upsertUser(EMAILS.realConsultant, "consultant", orgId);
  const realClient = await upsertUser(EMAILS.realClient, "client", orgId);
  const bypassConsultant = await upsertUser(EMAILS.bypassConsultant, "consultant", orgId);
  const bypassClient = await upsertUser(EMAILS.bypassClient, "client", orgId);

  // 3. Bypass-pair sessions (skip magic link)
  const consSession = await createSession(
    bypassConsultant.id,
    "127.0.0.1",
    "dev-seed-affirm",
  );
  const client2Session = await createSession(
    bypassClient.id,
    "127.0.0.1",
    "dev-seed-affirm",
  );

  const origin = originFromReq(req);

  // 4. Demo bundle (issued, owned by bypass consultant)
  const demo = await ensureDemoBundle(bypassConsultant.id);

  // ── Activate modes ─────────────────────────────────────────────────
  const as = req.nextUrl.searchParams.get("as");
  if (as === "cons") {
    const res = NextResponse.redirect(new URL("/affirm", req.url), 303);
    res.cookies.set("abeam-session", consSession.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return res;
  }
  if (as === "client2") {
    const res = NextResponse.redirect(
      new URL(`/affirm/${demo.id}`, req.url),
      303,
    );
    res.cookies.set("abeam-session", client2Session.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return res;
  }

  // 5. Magic-link emails for the real pair.
  //
  // ?skipEmail=1 — for verifying the magic-link URL host fix without
  // dispatching real emails to the recipients' inbox. The endpoint
  // builds and saves the VerificationToken row exactly as the email
  // path would, then returns the URL inline. SMTP_USER is left
  // intact; we simply don't call sendEmail.
  const skipEmail = req.nextUrl.searchParams.get("skipEmail") === "1";
  if (skipEmail) {
    // Replicate the exact host-rewrite logic in sendMagicLink so we
    // can verify what URL would be embedded in the real email — no
    // VerificationToken row is created and no SMTP call is made.
    const wbHost = process.env.WORKBENCH_HOST;
    const nextAuthUrl = process.env.NEXTAUTH_URL ?? "<unset>";
    function previewFor(callbackPath: string): string {
      const isWb =
        !!wbHost &&
        (callbackPath.startsWith("/presales") ||
          callbackPath.startsWith("/affirm") ||
          callbackPath.startsWith("/c/"));
      const verifyBase = isWb ? `https://${wbHost}` : nextAuthUrl;
      const inner = new URL(`${verifyBase}/api/auth/callback/email`);
      inner.searchParams.set("token", "<RAW_TOKEN>");
      inner.searchParams.set("email", "<EMAIL>");
      inner.searchParams.set("callbackUrl", callbackPath);
      if (!isWb) return inner.toString();
      const confirm = new URL("/presales/login/confirm", `https://${wbHost}`);
      confirm.searchParams.set("next", inner.toString());
      return confirm.toString();
    }
    return NextResponse.json({
      ok: true,
      mode: "preview_only",
      note: "Email dispatch skipped. Magic-link URL preview only — no email sent, no VerificationToken row created.",
      masterData: counts,
      processFlow: flowCounts,
      runtimeEnv: {
        WORKBENCH_HOST: wbHost ?? null,
        NEXTAUTH_URL: nextAuthUrl,
      },
      previewMagicLink: {
        consultant: previewFor("/affirm"),
        client: previewFor(`/affirm/${demo.id}`),
      },
      demoBundle: {
        id: demo.id,
        client: demo.client,
        state: demo.state,
      },
    });
  }

  // We do this AFTER bypass session creation so the JSON response is
  // deterministic even if SMTP
  // is slow — emails dispatch in parallel.
  const magicLinkResults = await Promise.allSettled([
    sendMagicLink(EMAILS.realConsultant, "/affirm"),
    sendMagicLink(EMAILS.realClient, `/affirm/${demo.id}`),
  ]);
  const emailStatus = {
    [EMAILS.realConsultant]:
      magicLinkResults[0].status === "fulfilled"
        ? (magicLinkResults[0].value.sent ? "sent" : "smtp_error")
        : "exception",
    [EMAILS.realClient]:
      magicLinkResults[1].status === "fulfilled"
        ? (magicLinkResults[1].value.sent ? "sent" : "smtp_error")
        : "exception",
  };

  return NextResponse.json({
    ok: true,
    masterData: counts,
    realEmailPair: {
      mode: "magic_link_email",
      note: "Real magic-link emails dispatched via Brevo. Recipients open their inbox, click the link, and land authenticated on the workbench.",
      consultant: {
        email: realConsultant.email,
        userId: realConsultant.id,
        emailStatus: emailStatus[EMAILS.realConsultant],
        loginUrl: `${origin}/presales/login`,
        landsOn: `${origin}/affirm`,
      },
      client: {
        email: realClient.email,
        userId: realClient.id,
        emailStatus: emailStatus[EMAILS.realClient],
        loginUrl: `${origin}/presales/login`,
        landsOn: `${origin}/affirm/${demo.id}`,
      },
    },
    bypassPair: {
      mode: "session_paste_or_one_click",
      note:
        "No email round-trip. Click the activateUrl to set the abeam-session cookie and land directly on the workbench — or paste sessionCookieValue into DevTools → Application → Cookies on the Workbench host with Name=abeam-session, Path=/, HttpOnly, Secure.",
      consultant: {
        email: bypassConsultant.email,
        userId: bypassConsultant.id,
        sessionCookieValue: consSession.token,
        activateUrl: `${origin}/api/dev/seed-affirm?secret=${encodeURIComponent(expected)}&as=cons`,
        landsOn: `${origin}/affirm`,
      },
      client: {
        email: bypassClient.email,
        userId: bypassClient.id,
        sessionCookieValue: client2Session.token,
        activateUrl: `${origin}/api/dev/seed-affirm?secret=${encodeURIComponent(expected)}&as=client2`,
        landsOn: `${origin}/affirm/${demo.id}`,
      },
    },
    demoBundle: {
      id: demo.id,
      client: demo.client,
      state: demo.state,
      scopeCount: demo.scopeCount,
      questionCount: demo.questionCount,
      created: demo.created,
      refreshed: demo.refreshed,
      clientView: `${origin}/affirm/${demo.id}`,
      consultantReview: `${origin}/affirm/${demo.id}/review`,
    },
    processFlow: {
      ...flowCounts,
      note: "Layer-3 MY 2602 process-flow data seeded. UI strip lands once the aligned design ships.",
    },
    instructions: [
      "Real pair: each recipient checks their inbox for the magic-link email, clicks Continue, and lands authenticated on the workbench.",
      "Bypass pair: paste activateUrl into the browser to skip the magic-link entirely. Cookie is set and you land on the workbench page in one hop.",
      "Both consultants land on /affirm (the bundle index). Both clients land on /affirm/<demo-bundle-id> (the issued affirm cards).",
      "The demo bundle is in ISSUED state with Lead to Cash scope — clients can immediately submit answers; the consultant can review and release.",
    ],
  });
}
