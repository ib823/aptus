/**
 * POST /api/discovery/sessions/[id]/drive — the consultant half of the seam.
 *
 * Sets what the room is looking at. Consultant-authenticated; the client never
 * calls this — /d only ever READS the seam, via the SSE stream.
 *
 * Actions:
 *   start   — begin projecting (liveAt = now)
 *   goto    — move the room to a process
 *   end     — stop projecting. This does NOT seal: sealing stays the explicit
 *             action it already is. Ending a projection and closing a review are
 *             different decisions, and conflating them would seal a client's
 *             record because a laptop lid closed.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { findClientProcess } from "@/lib/discovery/client-library";
import { writeDiscoveryEvent } from "@/lib/discovery/external/audit";
import { effectiveStreamIds } from "@/lib/discovery/external/scope";
import { clientValueStreams } from "@/lib/discovery/client-library";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

const ACTIONS = new Set(["start", "goto", "end"]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { action, processId } = body as Record<string, unknown>;
  if (typeof action !== "string" || !ACTIONS.has(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const engagement = await prisma.discoveryEngagement.findUnique({
    where: { id },
    select: { id: true, valueStreamIds: true },
  });
  if (!engagement) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (action === "end") {
    await prisma.discoveryEngagement.update({
      where: { id },
      data: { liveAt: null, drivenProcessId: null, drivenAt: null },
    });
    await writeDiscoveryEvent({
      engagementId: id,
      type: "guest_session_ended",
      grantId: null,
      actorId: user.id,
      payload: { reason: "projection_ended" },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "start") {
    await prisma.discoveryEngagement.update({ where: { id }, data: { liveAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  // goto
  if (typeof processId !== "string" || !findClientProcess(processId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // A consultant cannot drive the room to a process outside the SESSION's scope
  // — the client's own view would refuse it, and the room would see a dead page.
  const scope = effectiveStreamIds({
    engagementStreamIds: engagement.valueStreamIds,
    grantStreamIds: [],
  });
  if (scope !== null) {
    const owning = clientValueStreams().find((vs) =>
      vs.workflows.some((wf) => wf.processes.some((p) => p.id === processId)),
    );
    if (!owning || !scope.includes(owning.id)) {
      return NextResponse.json({ error: "out_of_scope" }, { status: 403 });
    }
  }

  await prisma.discoveryEngagement.update({
    where: { id },
    data: { drivenProcessId: processId, drivenAt: new Date(), liveAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
