/**
 * POST /api/discovery/captures — harvest and promote (P4).
 *
 * Consultant-authenticated. Actions:
 *   harvest — pull the engagement's capture set out of C9 into the register
 *             (P4 §3 step 1). Idempotent per source item.
 *   triage  — classify / merge / drop
 *   promote — the gated write (P4 §3 step 5, §5.3, §5.5)
 *
 * The gates live in lib/discovery/workbench/capture.ts as pure functions, so the
 * wizard and this route enforce exactly the same rules and cannot drift.
 */

import { NextResponse, type NextRequest } from "next/server";
import { canPerformDiscoveryAction } from "@/lib/workbench/rbac";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import {
  CAPTURE_STATUSES,
  isCaptureType,
  promoteCapture,
  type CaptureType,
} from "@/lib/discovery/workbench/capture";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  /*
   * A capture records raw client material, before the anonymize step.
   *
   * Server-side, because a gate that only exists in the UI is a form hint.
   */
  if (!canPerformDiscoveryAction(user.role, "capture")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  // ── harvest ──────────────────────────────────────────────────────────────
  if (b.action === "harvest") {
    if (typeof b.engagementId !== "string") {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const engagementId = b.engagementId;
    const [differs, existing] = await Promise.all([
      // P4 §2 T1: a "we differ" reason is the primary capture. Only WITH a
      // reason — an unexplained differ has nothing to generalize.
      prisma.discoveryDecision.findMany({
        where: { engagementId, status: "differ", NOT: { reason: null } },
        select: { processId: true, reason: true },
      }),
      prisma.discoveryCapture.findMany({
        where: { engagementId },
        select: { linkedProcessId: true, rawText: true },
      }),
    ]);

    const seen = new Set(existing.map((e) => `${e.linkedProcessId}::${e.rawText}`));
    const fresh = differs
      .filter((d) => d.reason && !seen.has(`${d.processId}::${d.reason}`))
      .map((d) => ({
        engagementId,
        type: "T1-variant",
        rawText: d.reason!,
        linkedProcessId: d.processId,
        status: "candidate",
        capturedById: user.id,
      }));

    if (fresh.length > 0) await prisma.discoveryCapture.createMany({ data: fresh });
    return NextResponse.json({ ok: true, harvested: fresh.length });
  }

  // ── triage ───────────────────────────────────────────────────────────────
  if (b.action === "triage") {
    if (typeof b.captureId !== "string" || typeof b.status !== "string") {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    if (!(CAPTURE_STATUSES as readonly string[]).includes(b.status)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    // Promotion goes through the gated path, never here.
    if (b.status === "promoted") {
      return NextResponse.json({ error: "use_promote" }, { status: 400 });
    }
    const data: { status: string; type?: CaptureType } = { status: b.status };
    if (typeof b.type === "string") {
      if (!isCaptureType(b.type)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      data.type = b.type;
    }
    await prisma.discoveryCapture.update({ where: { id: b.captureId }, data });
    return NextResponse.json({ ok: true });
  }

  // ── promote ──────────────────────────────────────────────────────────────
  if (b.action === "promote") {
    if (typeof b.captureId !== "string" || typeof b.type !== "string" || !isCaptureType(b.type)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const result = await promoteCapture({
      captureId: b.captureId,
      type: b.type,
      name: String(b.name ?? ""),
      description: String(b.description ?? ""),
      linkedProcessId: typeof b.linkedProcessId === "string" ? b.linkedProcessId : null,
      observedIndustry: String(b.observedIndustry ?? ""),
      sensitive: b.sensitive === true,
      // The author is the signed-in consultant — not a field the form supplies,
      // or §5.5's gate could be satisfied by typing someone else's name.
      authoredById: user.id,
      reviewedById: typeof b.reviewedById === "string" ? b.reviewedById : "",
      anonymizationConfirmed: b.anonymizationConfirmed === true,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason, message: result.message }, { status: 422 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
