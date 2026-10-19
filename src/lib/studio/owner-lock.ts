/**
 * The row lock that makes OWN_APP's two halves see each other.
 *
 * OWN_APP is enforced from two sides. A decision route refuses a decider who
 * owns the app (`evaluateDecision`); the solutions PATCH refuses a claim by
 * someone who decided the app's live access (OWNER_CLAIM_BY_DECIDER). Each
 * side reads what the other writes — and they write DIFFERENT rows: the
 * decision lands on the ApiAccessGrant, the claim on the Solution.
 *
 * WHAT BROKE WITHOUT IT. An owner who had released every slot fired the
 * decision and the reclaim at the same moment. The decide route read the
 * owners (none) before the PATCH wrote them; the PATCH read the caller's
 * decisions (none) before the decide route's write committed. Both passed, and
 * against real PostgreSQL nine runs in ten ended with one person the decider
 * AND the owner of a live PROD write grant — no colleague needed. A
 * compare-and-set cannot close this under READ COMMITTED, because neither
 * write is conditional on the row the other one changes.
 *
 * So every one of those check-and-writes takes this lock on the Solution row
 * FIRST, inside its transaction, and reads the owners and the decided grants
 * only after holding it. The second caller waits for the first to commit and
 * then reads what it wrote (READ COMMITTED takes a fresh snapshot per
 * statement), so whichever lands first, the other is refused.
 *
 * The tenant is in the WHERE, as in every other write path: a lock on another
 * tenant's row is a lock nobody should be able to take. A row it does not find
 * is locked by nobody, and the caller's own scoped read then reports it gone.
 */

import type { Prisma } from "@prisma/client";

export async function lockSolutionOwnership(
  tx: Prisma.TransactionClient,
  solution: { organizationId: string; solutionId: string },
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "Solution"
    WHERE id = ${solution.solutionId} AND "organizationId" = ${solution.organizationId}
    FOR UPDATE`;
}
