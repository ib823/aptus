/**
 * POST /api/control-tower/grants/[grantId]/revoke — withdraw a settled grant.
 *
 * WHY THIS EXISTS, GIVEN THAT THE PRODUCT ARGUED AGAINST IT.
 *
 * v1 shipped deliberately without revocation. The reasoning was sound for the
 * ordinary case: a settled grant cannot be re-decided, so letting anyone flip a
 * decision would quietly rewrite history, and a grant that lapses leaves a
 * cleaner record than one that is yanked. "Expiry is the only end" is a real
 * design position, not an oversight.
 *
 * It breaks in two places.
 *
 * First, urgency. A leaked credential, a solution that turns out to be a test
 * artefact, a client withdrawing consent — none of those can wait for a date.
 * "We cannot stop this, but it expires in six weeks" is not an answer.
 *
 * Second, and worse, the expiry rule is not retroactive. `evaluateDecision`
 * only began refusing unbounded READ grants after rows had been written under
 * the looser rule, so grants exist that confer access, cannot lapse, and had no
 * remedy of any kind. The manual already calls that "a defect, not a state" —
 * and a defect whose only remedy is a database edit is an outage nobody can end
 * from inside the product.
 *
 * THIS IS NOT A RE-DECISION, and that distinction is the whole design. The
 * `decision` column is never touched: an APPROVED grant that is revoked still
 * reads APPROVED, because the approval genuinely happened and the ledger's job
 * is to say so. Revocation is a second, later fact recorded beside the first,
 * with its own actor, timestamp and stated reason. Both survive.
 *
 * Admin-only, same gate as deciding — withdrawing access is at least as
 * consequential as granting it.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { opsWhere, requireControlTower } from "@/lib/ops/guard";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { isGranting, type GrantDecision } from "@/lib/studio/grants";
import { canMutateControlTower } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";

const Body = z.object({
  /*
   * A withdrawal with no stated reason is unreviewable. This is the field
   * someone reads six months later when the client asks why their integration
   * stopped, so it is required and it has a floor — "x" is not a reason.
   */
  reason: z.string().trim().min(10).max(500),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ grantId: string }> },
) {
  const guard = await requireControlTower();
  if (!guard.ok) return guard.response;

  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in to continue.");
  if (!canMutateControlTower(user.role)) {
    return studioError(
      "FORBIDDEN",
      "Revoking a grant is an admin action, like deciding one.",
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return studioError(
      "VALIDATION_ERROR",
      "Give a reason of at least 10 characters. It is the record of why access was withdrawn.",
    );
  }

  const { grantId } = await ctx.params;

  // Scoped read: an admin of one organization cannot revoke another's grant.
  const grant = await prisma.apiAccessGrant.findFirst({
    // opsWhere is the ONLY place tenant widening is expressible, and it places
    // organizationId last so a caller-supplied one cannot win. Hand-rolling the
    // filter here is exactly the mistake its header warns about.
    where: opsWhere(guard.actor, { id: grantId }),
    select: {
      id: true,
      // Needed for the audit row when the actor is a global admin with no
      // organization of their own.
      organizationId: true,
      solutionId: true,
      externalId: true,
      environment: true,
      operation: true,
      decision: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!grant) return studioError("NOT_FOUND", "Grant not found.");

  /*
   * Refuse the no-ops rather than recording a withdrawal that withdrew nothing.
   * A REQUESTED grant is refused by deciding it REJECTED — that is the path
   * that keeps the ledger honest about what happened.
   */
  if (!isGranting(grant.decision as GrantDecision)) {
    return studioError(
      "CONFLICT",
      "This grant does not confer access, so there is nothing to revoke. Decide it REJECTED instead.",
    );
  }
  if (grant.revokedAt !== null) {
    // Idempotent in effect, explicit in the response: the caller should know
    // their action was not the one that ended this.
    return studioOk({
      grantId: grant.id,
      revokedAt: grant.revokedAt.toISOString(),
      alreadyRevoked: true,
    });
  }

  const now = new Date();
  const updated = await prisma.apiAccessGrant.update({
    /*
     * The organization is named again HERE, not merely on the read above.
     * A mutation that trusts the lookup preceding it is one refactor away from
     * writing across tenants, which is why tenant-scope-coverage fails a write
     * that omits it. Prisma's extendedWhereUnique allows the extra field.
     */
    where: { id: grant.id, organizationId: grant.organizationId },
    // `decision` is deliberately absent. See the header.
    data: {
      revokedAt: now,
      revokedById: user.id,
      revokedReason: parsed.data.reason,
    },
    select: { id: true, revokedAt: true, decision: true },
  });

  await writeConfigAudit({
    // A global admin has no organization of their own; the audit row belongs to
    // the tenant that owns the grant.
    organizationId: guard.actor.organizationId ?? grant.organizationId,
    actorId: user.id,
    entityType: "ApiAccessGrant",
    entityId: grant.id,
    action: "UPDATE",
    after: {
      event: "grant_revoked",
      reason: parsed.data.reason,
      // Recorded so the audit row shows what was withdrawn, not just that
      // something was.
      decisionAtRevocation: grant.decision,
      externalId: grant.externalId,
      environment: grant.environment,
      operation: grant.operation,
      wasUnbounded: grant.expiresAt === null,
    },
  });

  return studioOk({
    grantId: updated.id,
    revokedAt: updated.revokedAt!.toISOString(),
    /** Unchanged, and returned so callers can see it is unchanged. */
    decision: updated.decision,
    alreadyRevoked: false,
    effect:
      "The broker refuses this grant from the next call onward. The decision is left as it was — revocation is recorded beside it, not instead of it.",
  });
}
