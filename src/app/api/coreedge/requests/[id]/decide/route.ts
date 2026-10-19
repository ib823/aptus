/**
 * POST: record a decision on an access request, from the CoreEdge console.
 *
 * A CALLER, NOT A BACKEND. The rule engine is `evaluateDecision` in
 * lib/studio/grants.ts and it is untouched: requester ≠ approver, an end date
 * is mandatory, and a settled grant is never re-decided. Studio and Control
 * Tower each already call it through their own door with their own gating;
 * this is CoreEdge's door, with CoreEdge's gating (lib/coreedge/authz.ts) and
 * D2.
 *
 * D2 — SANDBOX_ONLY IS NEVER OFFERED. The decision union still carries it so
 * historical rows keep rendering as "Approved for Sandbox (historical)", and
 * the schema below refuses it as an INPUT. A vocabulary that can describe the
 * past without being able to create more of it is the whole point of the
 * decision; accepting it here would quietly reopen a door the design closed.
 *
 * THE EXPIRY COMES FROM THE GRANT ROW, never from the request body — the same
 * rule both existing doors follow. An approver who could set the end date in
 * the act of approving could set it to anything, and the request's own stated
 * end date is what the reviewer read before deciding.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { DISABLED_REASONS } from "@/lib/coreedge/copy";
import { refuseDecision } from "@/lib/coreedge/authz";
import { prisma } from "@/lib/db/prisma";
import { writeConfigAudit } from "@/lib/studio/audit";
import { evaluateDecision, type GrantDecision } from "@/lib/studio/grants";

export const dynamic = "force-dynamic";

/**
 * The four the console offers. SANDBOX_ONLY is absent by D2 and REQUESTED /
 * EXPIRED are not decisions a person asserts.
 *
 * `requestChanges` is not a grant decision at all — it returns the request to
 * its raiser without settling it — so it is named separately below.
 */
const bodySchema = z.object({
  decision: z.enum(["APPROVED", "READ_ONLY", "REJECTED"]),
  writeChecklistAcknowledged: z.boolean().optional().default(false),
});

function refused(reason: string, status: number): NextResponse {
  return NextResponse.json({ error: { message: reason } }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return refused("Sign in first.", 401);
  if (user.organizationId === null) return refused(DISABLED_REASONS.noPermission, 403);

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refused("That decision is not one this console offers.", 400);

  /*
   * TENANT FIRST, AND IN THE WHERE CLAUSE. Reading the grant by id alone and
   * checking the organization afterwards leaks which ids exist; this cannot
   * find another tenant's row at all.
   */
  const grant = await prisma.apiAccessGrant.findFirst({
    where: { id, organizationId: user.organizationId },
    select: {
      id: true,
      organizationId: true,
      decision: true,
      operation: true,
      environment: true,
      requestedById: true,
      expiresAt: true,
      // The app's owners, for OWN_APP: an owner may not approve their own app.
      solution: {
        select: { technicalOwnerId: true, businessOwnerId: true, supportOwnerId: true },
      },
    },
  });
  if (grant === null) return refused("No such request.", 404);

  const ownerIds = [
    grant.solution.technicalOwnerId,
    grant.solution.businessOwnerId,
    grant.solution.supportOwnerId,
  ];

  // The console's own gate, rendering the same sentence the screen shows.
  const consoleRefusal = refuseDecision({
    role: user.role,
    userId: user.id,
    requestedById: grant.requestedById,
    ownerIds,
    expiresAt: grant.expiresAt,
  });
  if (consoleRefusal !== null) return refused(DISABLED_REASONS[consoleRefusal], 403);

  // The authority. The console's gate renders a reason early; this decides.
  const outcome = evaluateDecision({
    current: grant.decision as GrantDecision,
    operation: grant.operation as "READ" | "CREATE" | "UPDATE",
    environment: grant.environment as "SANDBOX" | "DEV" | "TEST" | "PROD",
    requestedById: grant.requestedById,
    deciderId: user.id,
    ownerIds,
    next: parsed.data.decision,
    writeChecklistAcknowledged: parsed.data.writeChecklistAcknowledged,
    expiresAt: grant.expiresAt,
  });
  if (!outcome.ok) {
    return refused(outcome.message, outcome.reason === "NOT_PENDING" ? 409 : 403);
  }

  const decidedAt = new Date();
  const settled = await prisma.apiAccessGrant.updateMany({
    /*
     * THE TENANT IS RE-ASSERTED IN THE WRITE, not merely in the read above.
     * `tests/unit/studio/tenant-scope-coverage.test.ts` enforces this repo-wide
     * and caught this line: a write keyed on id alone trusts the lookup that
     * preceded it, and one refactor that moves or loosens that lookup turns a
     * scoped update into an unscoped one with nothing failing.
     *
     * AND SO IS THE PENDING STATE — a compare-and-set. The NOT_PENDING check
     * above read the row a moment ago, and two reviewers deciding together both
     * pass it; a plain update then let the later one silently overwrite a
     * decision already recorded and audited. With the guard in the WHERE only
     * the first write matches a REQUESTED row. The second matches nothing and is
     * refused below — the idiom claim-link uses for the same race.
     */
    where: { id: grant.id, organizationId: user.organizationId, decision: "REQUESTED" },
    data: {
      decision: parsed.data.decision,
      decidedById: user.id,
      decidedAt,
    },
  });
  if (settled.count === 0) {
    // Nothing was written, so nothing is audited: the trail records only the
    // decision that actually landed.
    return refused(
      "Someone else decided this request while you were reviewing it. Nothing was changed; reload to see their decision.",
      409,
    );
  }

  // The row exactly as written. The guard above makes this write the only one
  // that can settle the grant, so these values cannot have been superseded and
  // a re-read would return the same thing.
  const updated = {
    id: grant.id,
    decision: parsed.data.decision,
    decidedById: user.id,
    decidedAt,
    expiresAt: grant.expiresAt,
  };

  await writeConfigAudit({
    organizationId: grant.organizationId,
    actorId: user.id,
    entityType: "ApiAccessGrant",
    entityId: grant.id,
    action: "DECISION",
    before: { decision: grant.decision },
    // `decidedIn` is what tells an auditor which door a decision came through.
    after: { ...updated, decidedIn: "coreedge" },
  });

  return NextResponse.json({ data: updated });
}
