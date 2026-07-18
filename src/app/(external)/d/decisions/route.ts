/**
 * POST /d/decisions — persist one fit decision.
 *
 * The server is the authority on sealed, never the UI. The selector disables
 * itself on a sealed engagement, but that is cosmetic: this route refuses with
 * 409 regardless, mirroring the Affirm answers route
 * (`if (ctx.bundle.state !== "issued") return 409 { error: "sealed" }`).
 *
 * A `differ` with an empty reason is ACCEPTED (200), not rejected. Brief §9
 * makes the reason a completeness rule, not a validation rule: refusing the
 * write would throw away the reviewer's selection, which is worse than an
 * honestly-incomplete record. V4 reports the gap.
 */

import { NextResponse, type NextRequest } from "next/server";
import { writeDiscoveryEvent } from "@/lib/discovery/external/audit";
import { verifySessionNonce } from "@/lib/discovery/external/csrf";
import { requireGuestSession, isDeviceVerified } from "@/lib/discovery/external/guards";
import { saveDecision } from "@/lib/discovery/external/journey";
import { isSealed, touchGuestSession } from "@/lib/discovery/external/session";
import { isFitStatus } from "@/lib/discovery/fit";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";
import { findClientProcess } from "@/lib/discovery/client-library";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });

  const ctx = await requireGuestSession();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { processId, status, reason, csrf } = body as Record<string, unknown>;

  if (typeof csrf !== "string" || !verifySessionNonce(ctx.session.id, csrf)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof processId !== "string" || typeof status !== "string" || !isFitStatus(status)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // The processId must exist in the committed library — the decisions table has
  // no FK to it (the library is JSON), so this is the referential check.
  const process = findClientProcess(processId);
  if (!process) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Persona scope: a reviewer scoped to some streams cannot decide outside them.
  if (ctx.grant.valueStreamIds.length > 0) {
    const { clientValueStreams } = await import("@/lib/discovery/client-library");
    const owning = clientValueStreams().find((vs) =>
      vs.workflows.some((wf) => wf.processes.some((p) => p.id === processId)),
    );
    if (!owning || !ctx.grant.valueStreamIds.includes(owning.id)) {
      await writeDiscoveryEvent({
        engagementId: ctx.engagement.id,
        type: "external_action_denied",
        grantId: ctx.grant.id,
        payload: { reason: "out_of_scope", processId },
      });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  // Sealed is authoritative here, not in the UI.
  if (isSealed(ctx.engagement)) {
    await writeDiscoveryEvent({
      engagementId: ctx.engagement.id,
      type: "external_action_denied",
      grantId: ctx.grant.id,
      payload: { reason: "sealed", processId },
    });
    return NextResponse.json({ error: "sealed" }, { status: 409 });
  }

  await saveDecision({
    engagementId: ctx.engagement.id,
    grantId: ctx.grant.id,
    processId,
    status,
    reason: typeof reason === "string" ? reason : null,
  });
  await writeDiscoveryEvent({
    engagementId: ctx.engagement.id,
    type: "guest_decision_saved",
    grantId: ctx.grant.id,
    // The reason text is NOT logged — the event records that a decision landed,
    // not what the client said. The decision row is the record of that.
    payload: { processId, status },
  });
  void touchGuestSession(ctx.session.id);

  return NextResponse.json({ ok: true });
}
