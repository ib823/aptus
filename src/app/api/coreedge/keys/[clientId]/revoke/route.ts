/**
 * POST: revoke a key, from the CoreEdge console.
 *
 * A CALLER, NOT A BACKEND. `revokeClientToken` in lib/northbound/issue.ts does
 * the work and is untouched: the row is kept, `isActive` goes false and
 * `revokedAt` is stamped. What is new is the door and its gate.
 *
 * WHY A COREEDGE DOOR RATHER THAN STUDIO'S. `canMutateStudio` is the builder's
 * capability and `platform_admin` is deliberately false there — rbac.ts says so
 * and `canMutateControlTower` was added as "a NEW capability rather than a
 * re-use" for exactly this reason. D4 gives revocation to a platform admin or a
 * reviewer, which Studio's gate does not express; widening Studio's gate to
 * satisfy a CoreEdge decision would change Studio's security posture for a
 * reason that has nothing to do with Studio.
 *
 * D4, AND THE OPERATOR. An operator flags and notifies; they never revoke. The
 * screen does not render the control for them at all — a destructive action
 * nobody may take is not a disabled control, it is not that person's control —
 * and this route refuses them in the same words, because a screen that hides a
 * button is not a gate.
 *
 * A REASON IS REQUIRED and it is recorded. Revocation cannot be undone and the
 * calls that fail afterwards will need explaining; the confirmation dialog
 * demands it before the button works, and so does this.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { refuseRevokeKey } from "@/lib/coreedge/authz";
import { DISABLED_REASONS } from "@/lib/coreedge/copy";
import { prisma } from "@/lib/db/prisma";
import { revokeClientToken } from "@/lib/northbound/issue";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";
import { writeConfigAudit } from "@/lib/studio/audit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // The same floor Control Tower's grant revoke uses: a reason short enough to
  // be meaningless is the same as no reason.
  reason: z.string().trim().min(10).max(500),
});

function refused(message: string, status: number): NextResponse {
  return NextResponse.json({ error: { message } }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return refused("Sign in first.", 401);
  if (user.organizationId === null) return refused(DISABLED_REASONS.noPermission, 403);

  const refusal = refuseRevokeKey(user.role);
  if (refusal !== null) return refused(DISABLED_REASONS[refusal], 403);

  const { clientId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return refused("Give a reason first. It is recorded with the change.", 400);
  }

  const existing = await prisma.solutionClient.findFirst({
    where: { id: clientId, organizationId: user.organizationId },
    select: { id: true, solutionId: true, environment: true, revokedAt: true },
  });
  if (existing === null) return refused("No such key.", 404);
  if (existing.revokedAt !== null) {
    // Idempotent, and it says so. Two people pressing revoke is not an error.
    return NextResponse.json({
      data: { id: existing.id, revokedAt: existing.revokedAt, alreadyRevoked: true },
    });
  }

  /*
   * `TenantScope` is branded and `tenantScopeOf` is the one place the brand is
   * applied, so a scope cannot be minted from request input. The organization
   * here came from the session and was already used to find the row above.
   */
  const revoked = await revokeClientToken(tenantScopeOf(user.organizationId), clientId);
  if (revoked === null) return refused("No such key.", 404);

  await writeConfigAudit({
    organizationId: user.organizationId,
    actorId: user.id,
    entityType: "ClientCredential",
    entityId: clientId,
    action: "REVOKE",
    after: {
      event: "client_credential_revoked",
      revokedIn: "coreedge",
      solutionId: existing.solutionId,
      environment: existing.environment,
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({ data: { id: clientId, revoked: true } });
}
