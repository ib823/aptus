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
    },
  });
  if (grant === null) return refused("No such request.", 404);

  // The console's own gate, rendering the same sentence the screen shows.
  const consoleRefusal = refuseDecision({
    role: user.role,
    userId: user.id,
    requestedById: grant.requestedById,
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
    next: parsed.data.decision,
    writeChecklistAcknowledged: parsed.data.writeChecklistAcknowledged,
    expiresAt: grant.expiresAt,
  });
  if (!outcome.ok) {
    return refused(outcome.message, outcome.reason === "NOT_PENDING" ? 409 : 403);
  }

  const updated = await prisma.apiAccessGrant.update({
    /*
     * THE TENANT IS RE-ASSERTED IN THE WRITE, not merely in the read above.
     * `tests/unit/studio/tenant-scope-coverage.test.ts` enforces this repo-wide
     * and caught this line: a write keyed on id alone trusts the lookup that
     * preceded it, and one refactor that moves or loosens that lookup turns a
     * scoped update into an unscoped one with nothing failing.
     */
    where: { id: grant.id, organizationId: user.organizationId },
    data: {
      decision: parsed.data.decision,
      decidedById: user.id,
      decidedAt: new Date(),
    },
    select: { id: true, decision: true, decidedById: true, decidedAt: true, expiresAt: true },
  });

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
