/**
 * POST /api/affirm/bundles/[id]/grants/[grantId]/reissue — reissue a grant.
 *
 * Mints a fresh grant (same identity + stream scope), supersedes the old one
 * (its link dies, its sessions end), and emails the new invite. This also
 * serves the "resend invite" action — the original raw token is unrecoverable
 * by design (only its SHA-256 is stored), so a resend necessarily issues a new
 * link. Consultant-authed; writes grant_reissued.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { reissueGrant } from "@/lib/affirm/external/grants";
import { dispatchEmail } from "@/lib/presales/emails";
import { renderAffirmInviteEmail } from "@/lib/affirm/external/emails";

function inviteUrl(req: NextRequest, rawToken: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  return `${origin}/a/${rawToken}`;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; grantId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, grantId } = await ctx.params;

  const existing = await prisma.affirmAccessGrant.findUnique({
    where: { id: grantId },
    select: { bundleId: true },
  });
  if (!existing || existing.bundleId !== id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bundle = await prisma.affirmBundle.findUnique({
    where: { id },
    select: { client: true, state: true },
  });
  if (!bundle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (bundle.state !== "issued" && bundle.state !== "submitted") {
    return NextResponse.json({ error: "bundle_not_issued" }, { status: 409 });
  }

  const result = await reissueGrant({ grantId, actorId: user.id });
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await dispatchEmail(
    renderAffirmInviteEmail({
      recipientEmail: result.grant.email,
      displayName: result.grant.displayName,
      roleLabel: result.grant.roleLabel,
      clientLabel: bundle.client,
      inviteUrl: inviteUrl(req, result.rawToken),
    }),
    { bestEffort: true },
  );

  return NextResponse.json({ ok: true, grantId: result.grant.id });
}
