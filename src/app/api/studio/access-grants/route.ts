/**
 * /api/studio/access-grants — the request → decision ledger.
 *
 *   GET   list this organization's grants
 *   POST  raise a request  (any builder)
 *   PATCH record a decision (a DIFFERENT builder — see segregation of duties)
 *
 * This ledger is enforced at runtime: the northbound broker checks a live,
 * unexpired, unrevoked grant on every call a solution makes. The GET therefore
 * returns the revocation fields too — a reader that omits them shows "Approved"
 * for a grant the broker refuses. The rules that decide whether a decision may
 * be recorded live in lib/studio/grants.ts, deliberately separate from this
 * transport layer so they can be tested exhaustively.
 *
 * A DECISION NEEDS A FRESH PASSKEY once COREEDGE_STEP_UP is enforce
 * (lib/auth/step-up.ts); raising a request does not, because the requester is
 * not the control.
 *
 * EVERY REQUEST IS BOUND TO ONE INTERFACE (P0.1, A47). The request names the
 * interface it is for, and the service, operation and SAP product are read
 * from that row, never taken from the body; a decision binds a request that
 * is not bound yet, or refuses to approve it (lib/studio/grant-binding.ts).
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { recordGrantDecided, recordJourneyEvent } from "@/lib/coreedge/journey";
import {
  checkStepUp,
  recordStepUpMissing,
  STEP_UP_MAX_AGE_SECONDS,
  type StepUpMissing,
} from "@/lib/auth/step-up";
import { prisma } from "@/lib/db/prisma";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { bindingForDecision, findBinding } from "@/lib/studio/grant-binding";
import { grantPolicyCheck } from "@/lib/studio/grant-policy";
import {
  evaluateDecision,
  type GrantDecision,
  type GrantEnvironment,
  type GrantOperation,
} from "@/lib/studio/grants";
import { lockSolutionOwnership } from "@/lib/studio/owner-lock";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  solutionId: z.string().min(1),
  /**
   * The interface the request is for. The service, operation and SAP product
   * of the grant are read from it. Optional only for callers that predate
   * P0.1: without it the request is bound to the one interface its externalId
   * and operation name, and refused when there are several.
   */
  interfaceId: z.string().min(1).max(80).optional(),
  externalId: z.string().min(1).max(200),
  operation: z.enum(["READ", "CREATE", "UPDATE"]),
  environment: z.enum(["SANDBOX", "DEV", "TEST", "PROD"]),
  justification: z.string().min(10).max(2000),
  /*
   * REQUIRED, because every granting decision requires it (grants.ts
   * evaluateDecision). Optional here produced requests that could only ever be
   * rejected, and the approver has no field to supply the date themselves --
   * deliberately, since inventing the boundary on access you are granting is
   * what that rule prevents.
   */
  expiresAt: z.string().datetime(),
});

const decisionSchema = z.object({
  grantId: z.string().min(1),
  decision: z.enum(["APPROVED", "SANDBOX_ONLY", "READ_ONLY", "REJECTED"]),
  /** The approver has explicitly worked through the write checklist. */
  writeChecklistAcknowledged: z.boolean().optional().default(false),
});

/** Shared preamble: authenticated, entitled, and scoped to a tenant. */
async function requireBuilder() {
  const user = await getCurrentUser();
  if (!user) return { error: studioError("UNAUTHENTICATED", "Sign in required.") } as const;
  if (!canAccessStudio(user.role)) {
    return { error: studioError("FORBIDDEN", "Developer Studio is role-gated.") } as const;
  }
  if (!canMutateStudio(user.role)) {
    return {
      error: studioError("FORBIDDEN", "Your role can view the ledger but not act on it."),
    } as const;
  }
  if (lacksStudioTenantScope(user) || !user.organizationId) {
    return { error: studioError("FORBIDDEN", "No organization scope.") } as const;
  }
  return { user, organizationId: user.organizationId } as const;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) {
    return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  }
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const organizationId = user.organizationId;
  if (!organizationId) return studioOk({ grants: [] });

  const grants = await prisma.apiAccessGrant.findMany({
    where: { organizationId },
    select: {
      id: true,
      solutionId: true,
      externalId: true,
      operation: true,
      environment: true,
      justification: true,
      decision: true,
      requestedById: true,
      decidedById: true,
      decidedAt: true,
      expiresAt: true,
      revokedAt: true,
      revokedReason: true,
      createdAt: true,
      // The binding (P0.1): which interface and SAP system this grant covers,
      // and why a legacy one covers none.
      interfaceId: true,
      sapProduct: true,
      unboundReason: true,
      solution: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return studioOk({ grants });
}

export async function POST(request: NextRequest) {
  const auth = await requireBuilder();
  if ("error" in auth) return auth.error;
  const { user, organizationId } = auth;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return studioError("VALIDATION_ERROR", "Invalid access request.");
  }
  const input = parsed.data;

  // Re-scope the caller-supplied solutionId. A solution in another tenant is
  // indistinguishable from one that does not exist.
  const solution = await prisma.solution.findFirst({
    where: { id: input.solutionId, organizationId },
    select: { id: true },
  });
  if (!solution) return studioError("NOT_FOUND", "Solution not found.");

  /*
   * BIND THE REQUEST TO ITS INTERFACE (P0.1, A47). The interface is re-scoped
   * to this tenant AND this app, and the grant takes its service, operation
   * and product from the row. The body's externalId and operation are kept
   * for older callers and must agree with it: a mismatch is a request for
   * something other than what the interface is.
   */
  let binding: { interfaceId: string; externalId: string; operation: string; sapProduct: string };
  if (input.interfaceId !== undefined) {
    const iface = await prisma.interface.findFirst({
      where: { id: input.interfaceId, organizationId, solutionId: solution.id },
      select: { id: true, externalId: true, operation: true, sapProduct: true },
    });
    if (!iface) return studioError("NOT_FOUND", "Interface not found on this solution.");
    if (iface.externalId !== input.externalId || iface.operation !== input.operation) {
      return studioError(
        "VALIDATION_ERROR",
        "The service or operation does not match the interface named. Raise the request from the interface itself.",
      );
    }
    binding = { interfaceId: iface.id, externalId: iface.externalId, operation: iface.operation, sapProduct: iface.sapProduct };
  } else {
    const found = await findBinding(prisma, {
      organizationId,
      solutionId: solution.id,
      externalId: input.externalId,
      operation: input.operation,
    });
    if (!found.ok) {
      return studioError(
        "VALIDATION_ERROR",
        found.reason === "AMBIGUOUS"
          ? "More than one of this solution's interfaces uses this service and operation (on different SAP systems). Name the interface the request is for."
          : "No interface of this solution uses this service and operation. Add the interface first, then request access to it.",
      );
    }
    binding = {
      interfaceId: found.interfaceId,
      externalId: input.externalId,
      operation: input.operation,
      sapProduct: found.sapProduct,
    };
  }

  const created = await prisma.apiAccessGrant.create({
    data: {
      solutionId: solution.id,
      organizationId,
      interfaceId: binding.interfaceId,
      sapProduct: binding.sapProduct,
      externalId: binding.externalId,
      operation: binding.operation,
      environment: input.environment,
      justification: input.justification,
      // Always REQUESTED. A request never arrives pre-approved — least of all a
      // write, which must be decided by a second person (see PATCH).
      decision: "REQUESTED",
      requestedById: user.id,
      ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
    },
    select: {
      id: true,
      interfaceId: true,
      sapProduct: true,
      externalId: true,
      operation: true,
      environment: true,
      decision: true,
      requestedById: true,
      createdAt: true,
    },
  });

  await writeConfigAudit({
    organizationId,
    actorId: user.id,
    entityType: "ApiAccessGrant",
    entityId: created.id,
    action: "CREATE",
    after: created,
  });

  // Where time to first real call starts, and where approver wait starts
  // (P2.12). After the write, and unable to fail it.
  await recordJourneyEvent({
    organizationId,
    kind: "GRANT_REQUESTED",
    solutionId: solution.id,
    environment: created.environment,
    subjectId: created.id,
    actorUserId: user.id,
    at: created.createdAt,
  });

  return studioOk(created, 201);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBuilder();
  if ("error" in auth) return auth.error;
  const { user, organizationId } = auth;

  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid decision.");
  const input = parsed.data;

  const located = await prisma.apiAccessGrant.findFirst({
    where: { id: input.grantId, organizationId },
    select: { solutionId: true },
  });
  if (!located) return studioError("NOT_FOUND", "Request not found.");

  /*
   * LOCK THE APP, THEN READ WHAT IS DECIDED ON. OWN_APP compares the decider
   * with the app's owners, which the solutions PATCH writes on a different row
   * from the grant settled here — so a reclaim fired together with this
   * decision used to pass on owners read a moment before it landed. Both take
   * the same lock (lib/studio/owner-lock.ts), so whichever lands first, the
   * other reads what it wrote and is refused.
   */
  // A warn-mode admission, recorded once the transaction has ended (below).
  let stepUpMissing = null as StepUpMissing | null;
  const decided = await prisma.$transaction(async (tx) => {
    await lockSolutionOwnership(tx, { organizationId, solutionId: located.solutionId });

    const grant = await tx.apiAccessGrant.findFirst({
      where: { id: input.grantId, organizationId },
      select: {
        id: true,
        decision: true,
        operation: true,
        environment: true,
        requestedById: true,
        externalId: true,
        solutionId: true,
        organizationId: true,
        expiresAt: true,
        interfaceId: true,
        sapProduct: true,
        // A flagged legacy request is never bound by a guess, nor to an
        // interface added after it was raised (lib/studio/grant-binding.ts).
        unboundReason: true,
        createdAt: true,
        // The app's owners, for OWN_APP: an owner may not approve their own app.
        solution: {
          select: { technicalOwnerId: true, businessOwnerId: true, supportOwnerId: true },
        },
      },
    });
    if (!grant) return { refusal: studioError("NOT_FOUND", "Request not found.") };

    const verdict = evaluateDecision({
      current: grant.decision as GrantDecision,
      operation: grant.operation as GrantOperation,
      environment: grant.environment as GrantEnvironment,
      requestedById: grant.requestedById,
      deciderId: user.id,
      ownerIds: [
        grant.solution.technicalOwnerId,
        grant.solution.businessOwnerId,
        grant.solution.supportOwnerId,
      ],
      next: input.decision as GrantDecision,
      writeChecklistAcknowledged: input.writeChecklistAcknowledged,
      // Taken from the REQUEST, not from the decision: an approver may not invent
      // the boundary on a write they are approving. A write request that arrived
      // without an expiry is rejected and re-raised, which leaves both rows in the
      // ledger — the same shape as re-deciding a settled grant.
      expiresAt: grant.expiresAt,
    });

    if (!verdict.ok) {
      // CONFLICT for "already settled", FORBIDDEN for the governance controls —
      // the distinction tells the caller whether to retry or to find a colleague.
      const code = verdict.reason === "NOT_PENDING" ? "CONFLICT" : "FORBIDDEN";
      return { refusal: studioError(code, verdict.message) };
    }

    // The decision binds the request to its one interface, or an approval is
    // refused (P0.1, A47): see lib/studio/grant-binding.ts.
    const bound = await bindingForDecision(tx, grant, input.decision);
    if (!bound.ok) return { refusal: studioError("CONFLICT", bound.message) };

    // SAP API Policy §1.2 (P1.2): refused where enforced, noted where observed.
    const policy = await grantPolicyCheck(tx, {
      organizationId,
      interfaceId: bound.binding?.interfaceId ?? grant.interfaceId,
      decision: input.decision,
    });
    if (!policy.ok) return { refusal: studioError("FORBIDDEN", policy.message) };

    // The passkey last, once every rule has passed: it is then the one thing
    // between this person and the decision (lib/auth/step-up.ts). Checked
    // here, recorded after the transaction: the record needs a pooled
    // connection, and this transaction holds one and the lock.
    const stepUp = checkStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
      action: "grant.decide",
      targetId: grant.id,
      organizationId,
    });
    if (!stepUp.ok) return { refusal: stepUp.response };
    if (stepUp.outcome === "warned") stepUpMissing = stepUp.missing;

    /*
     * A COMPARE-AND-SET, not an update. The NOT_PENDING check above read the row
     * a moment ago, and two reviewers deciding together both pass it — so a plain
     * update let the later one silently overwrite a decision already recorded and
     * audited, which is the history rewrite NOT_PENDING exists to forbid. With
     * `decision: "REQUESTED"` in the WHERE only the first write matches; the
     * second matches nothing and is refused, and writes no audit row.
     */
    const decidedAt = new Date();
    const settled = await tx.apiAccessGrant.updateMany({
      where: { id: grant.id, organizationId, decision: "REQUESTED" },
      data: {
        decision: input.decision,
        decidedById: user.id,
        decidedAt,
        ...(bound.binding ? { ...bound.binding, unboundReason: null } : {}),
      },
    });
    if (settled.count === 0) {
      return {
        refusal: studioError(
          "CONFLICT",
          "Someone else decided this request while you were reviewing it. Nothing was changed; reload to see their decision.",
        ),
      };
    }
    return { grant, decidedAt, binding: bound.binding, policySignOffMissing: policy.policySignOffMissing };
  });
  if (stepUpMissing) await recordStepUpMissing(stepUpMissing);
  if ("refusal" in decided) return decided.refusal;
  const { grant, decidedAt, binding, policySignOffMissing } = decided;

  // The row exactly as written: the guard makes this the only write that can
  // settle the grant, so a re-read would return the same values.
  const updated = {
    id: grant.id,
    decision: input.decision,
    decidedById: user.id,
    decidedAt,
    operation: grant.operation,
    environment: grant.environment,
    externalId: grant.externalId,
    interfaceId: binding?.interfaceId ?? grant.interfaceId,
    sapProduct: binding?.sapProduct ?? grant.sapProduct,
  };

  await writeConfigAudit({
    organizationId,
    actorId: user.id,
    entityType: "ApiAccessGrant",
    entityId: grant.id,
    action: "DECISION",
    before: { decision: grant.decision },
    // What COREEDGE_API_POLICY_SIGNOFF=enforce would have refused (P1.2).
    after: { ...updated, ...(policySignOffMissing ? { policySignOffMissing: true } : {}) },
  });

  await recordGrantDecided({ grant, decision: input.decision, decidedAt, deciderId: user.id });

  return studioOk({ ...updated, ...(policySignOffMissing ? { policySignOffMissing: true } : {}) });
}
