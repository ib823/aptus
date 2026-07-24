/**
 * POST /api/discovery/sessions/[id]/grants — session scope + reviewer grants.
 *
 * Consultant-authenticated. Mirrors the Affirm S9 grant lifecycle: revoke is
 * terminal and ends the reviewer's live sessions; resend re-issues an OTP rather
 * than minting a new token, so the invite link a reviewer already has keeps
 * working.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { clientValueStreams } from "@/lib/discovery/client-library";
import { writeDiscoveryEvent } from "@/lib/discovery/external/audit";
import { issueGuestOtp } from "@/lib/discovery/external/otp";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";
import { requireDiscoveryEngagementAccess } from "@/lib/discovery/authz";

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
  const { action, valueStreamIds, grantId } = body as Record<string, unknown>;

  const access = await requireDiscoveryEngagementAccess(id, user);
  if (!access.ok) return access.response;

  if (action === "scope") {
    if (!Array.isArray(valueStreamIds) || valueStreamIds.some((v) => typeof v !== "string")) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    // Every id must be a real stream — a typo'd scope would silently hide
    // everything from the client.
    const known = new Set(clientValueStreams().map((vs) => vs.id));
    if ((valueStreamIds as string[]).some((v) => !known.has(v))) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    await prisma.discoveryEngagement.update({
      where: { id },
      data: { valueStreamIds: valueStreamIds as string[] },
    });
    return NextResponse.json({ ok: true });
  }

  if (typeof grantId !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const grant = await prisma.discoveryAccessGrant.findFirst({
    where: { id: grantId, engagementId: id },
    select: { id: true, revokedAt: true },
  });
  if (!grant) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (action === "revoke") {
    if (grant.revokedAt) return NextResponse.json({ ok: true }); // idempotent
    await prisma.$transaction(async (tx) => {
      await tx.discoveryAccessGrant.update({
        where: { id: grantId },
        data: { revokedAt: new Date(), revokedById: user.id },
      });
      // Revoking access that leaves a live session open is not revoking access.
      await tx.discoveryGuestSession.updateMany({
        where: { grantId, endedAt: null },
        data: { endedAt: new Date(), endedReason: "ended_by_consultant" },
      });
    });
    await writeDiscoveryEvent({
      engagementId: id,
      type: "grant_revoked",
      grantId,
      actorId: user.id,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "resend") {
    if (grant.revokedAt) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await issueGuestOtp({ grantId, kind: "resend" });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
