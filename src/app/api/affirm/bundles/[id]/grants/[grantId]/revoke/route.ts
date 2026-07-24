/**
 * POST /api/affirm/bundles/[id]/grants/[grantId]/revoke — revoke a grant.
 *
 * Consultant-authed. Idempotent (revoking an already-revoked grant is a no-op).
 * Ends the grant's live guest sessions and writes grant_revoked.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { revokeGrant } from "@/lib/affirm/external/grants";
import { requireAffirmBundleAccess } from "@/lib/affirm/authz";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; grantId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, grantId } = await ctx.params;
  const access = await requireAffirmBundleAccess(id, user);
  if (!access.ok) return access.response;

  const grant = await prisma.affirmAccessGrant.findUnique({
    where: { id: grantId },
    select: { bundleId: true },
  });
  if (!grant || grant.bundleId !== id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await revokeGrant({ grantId, actorId: user.id });
  return NextResponse.json({ ok: true });
}
