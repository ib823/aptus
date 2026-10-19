/**
 * /api/studio/solutions — the solution passport.
 *
 *   GET   list this organization's solutions (?mine=1 for your own)
 *   POST  register a solution (always DRAFT)
 *   PATCH edit, including promotion — where the ownership gate applies
 *
 * The ownership rules live in lib/studio/solutions.ts. They are applied HERE, on
 * the write path, because a gate that only exists in the form is one API call
 * away from being bypassed.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { closePendingClaimLinks } from "@/lib/northbound/issue";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { DATA_CLASS_VALUES } from "@/lib/studio/data-class";
import { effectiveDecision, isGranting } from "@/lib/studio/grants";
import { lockSolutionOwnership } from "@/lib/studio/owner-lock";
import {
  OWNER_CLAIM_BY_DECIDER,
  OWNER_RELEASE_WHILE_PENDING,
  claimedOwnerSlots,
  evaluatePromotion,
  isOrphaningAnActiveSolution,
  ownerAssignmentRefusal,
  rejectedOwnerAssignments,
  resolveStatusOnSave,
  slugify,
  stepsCallerDown,
  type SolutionStatus,
} from "@/lib/studio/solutions";

export const dynamic = "force-dynamic";

const KINDS = ["INTERNAL_ACCELERATOR", "PRESALES_DEMO", "CLIENT_APP", "REUSABLE", "EXPERIMENT"] as const;

const createSchema = z.object({
  name: z.string().min(2).max(120),
  classification: z.enum(KINDS),
  businessProblem: z.string().min(10).max(2000),
  /*
   * A closed vocabulary. This was z.string().min(1).max(80), which is how
   * `czxgvz` reached the solution register — a classification field that
   * accepts anything classifies nothing.
   */
  dataClass: z.enum(DATA_CLASS_VALUES as unknown as [string, ...string[]]),
  repoUrl: z.string().url().max(500).optional(),
  packagingNote: z.string().max(2000).optional(),
  reuseIntent: z.string().max(2000).optional(),
  technicalOwnerId: z.string().max(80).nullish(),
  businessOwnerId: z.string().max(80).nullish(),
  supportOwnerId: z.string().max(80).nullish(),
});

const patchSchema = createSchema.partial().extend({
  id: z.string().min(1),
  status: z.enum(["DRAFT", "ACTIVE", "RESTRICTED", "RETIRED"]).optional(),
});

async function requireBuilder() {
  const user = await getCurrentUser();
  if (!user) return { error: studioError("UNAUTHENTICATED", "Sign in required.") } as const;
  if (!canAccessStudio(user.role)) {
    return { error: studioError("FORBIDDEN", "Developer Studio is role-gated.") } as const;
  }
  if (!canMutateStudio(user.role)) {
    return { error: studioError("FORBIDDEN", "Your role can view solutions but not author them.") } as const;
  }
  if (lacksStudioTenantScope(user) || !user.organizationId) {
    return { error: studioError("FORBIDDEN", "No organization scope.") } as const;
  }
  return { user, organizationId: user.organizationId } as const;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const organizationId = user.organizationId;
  if (!organizationId) return studioOk({ solutions: [] });

  const mine = request.nextUrl.searchParams.get("mine") === "1";

  const solutions = await prisma.solution.findMany({
    where: {
      organizationId,
      // "Mine" means a solution I am accountable for, in any of the three roles —
      // not merely one I happened to create.
      ...(mine
        ? {
            OR: [
              { technicalOwnerId: user.id },
              { businessOwnerId: user.id },
              { supportOwnerId: user.id },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      classification: true,
      businessProblem: true,
      status: true,
      dataClass: true,
      technicalOwnerId: true,
      businessOwnerId: true,
      supportOwnerId: true,
      repoUrl: true,
      packagingNote: true,
      reuseIntent: true,
      createdAt: true,
      _count: { select: { interfaces: true, grants: true } },
    },
    orderBy: { name: "asc" },
  });

  return studioOk({ solutions });
}

export async function POST(request: NextRequest) {
  const auth = await requireBuilder();
  if ("error" in auth) return auth.error;
  const { user, organizationId } = auth;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid solution payload.");
  const input = parsed.data;

  // Ownership is claimed, never assigned — on registration too. Without this a
  // caller could name three colleagues at create time and then issue the
  // credential alone, which is the whole bypass the segregation rule exists to
  // stop. See `rejectedOwnerAssignments`.
  const assignedToOthers = rejectedOwnerAssignments(input, user.id);
  if (assignedToOthers.length > 0) {
    return studioError("FORBIDDEN", ownerAssignmentRefusal(assignedToOthers));
  }

  const baseSlug = slugify(input.name);
  if (!baseSlug) return studioError("VALIDATION_ERROR", "That name has no usable slug.");

  // Slug is unique per organization. Suffix rather than reject: a second "Finance
  // accelerator" is a normal thing to want, and failing the save over a name
  // collision would be a pointless obstacle.
  let slug = baseSlug;
  for (let n = 2; n <= 50; n++) {
    const clash = await prisma.solution.findFirst({
      where: { organizationId, slug },
      select: { id: true },
    });
    if (!clash) break;
    slug = `${baseSlug}-${n}`;
  }

  const created = await prisma.solution.create({
    data: {
      organizationId,
      name: input.name,
      slug,
      classification: input.classification,
      businessProblem: input.businessProblem,
      dataClass: input.dataClass,
      // A solution is always registered as a DRAFT. Promotion is a separate,
      // gated act — nothing arrives already ACTIVE.
      status: "DRAFT",
      ...(input.repoUrl ? { repoUrl: input.repoUrl } : {}),
      ...(input.packagingNote ? { packagingNote: input.packagingNote } : {}),
      ...(input.reuseIntent ? { reuseIntent: input.reuseIntent } : {}),
      ...(input.technicalOwnerId ? { technicalOwnerId: input.technicalOwnerId } : {}),
      ...(input.businessOwnerId ? { businessOwnerId: input.businessOwnerId } : {}),
      ...(input.supportOwnerId ? { supportOwnerId: input.supportOwnerId } : {}),
    },
    select: { id: true, name: true, slug: true, status: true, classification: true },
  });

  await writeConfigAudit({
    organizationId,
    actorId: user.id,
    entityType: "Solution",
    entityId: created.id,
    action: "CREATE",
    after: created,
  });

  return studioOk(created, 201);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBuilder();
  if ("error" in auth) return auth.error;
  const { user, organizationId } = auth;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid solution payload.");
  const input = parsed.data;

  // OWNERSHIP IS CLAIMED, NEVER ASSIGNED. Checked before the solution is even
  // looked up, so the refusal cannot depend on anything about the target row.
  //
  // The UI only ever offers claim (set to self) and clear (set to null), so it
  // already behaved this way — but the route accepted an arbitrary id, and a
  // control that lives only in a client is not a control. See
  // `rejectedOwnerAssignments` for what the bypass actually buys an attacker.
  const assignedToOthers = rejectedOwnerAssignments(input, user.id);
  if (assignedToOthers.length > 0) {
    return studioError("FORBIDDEN", ownerAssignmentRefusal(assignedToOthers));
  }

  /*
   * ONE TRANSACTION, LOCKED ON THE SOLUTION ROW BEFORE ANYTHING IS READ. The
   * owner-slot refusals below read this app's grants, and every decision route
   * reads the owners this save writes — different rows, so neither write is
   * conditional on what the other checks, and a decision fired together with a
   * reclaim used to pass both. Every decision route takes this same lock
   * (lib/studio/owner-lock.ts), so whichever lands first, the other waits,
   * reads what it wrote, and is refused.
   */
  const saved = await prisma.$transaction(async (tx) => {
    await lockSolutionOwnership(tx, { organizationId, solutionId: input.id });

    // Re-scope the caller-supplied id. Another tenant's solution is
    // indistinguishable from one that does not exist.
    const current = await tx.solution.findFirst({
      where: { id: input.id, organizationId },
      select: {
        id: true,
        name: true,
        status: true,
        technicalOwnerId: true,
        businessOwnerId: true,
        supportOwnerId: true,
        repoUrl: true,
        packagingNote: true,
        reuseIntent: true,
        businessProblem: true,
        dataClass: true,
        classification: true,
      },
    });
    if (!current) return { refusal: studioError("NOT_FOUND", "Solution not found.") };

    // `undefined` means "not mentioned in this request" (keep); `null` means
    // "explicitly cleared" — the distinction is what makes losing an owner
    // expressible at all, and therefore what makes the auto-drop possible.
    const nextOwnership = {
      technicalOwnerId:
        input.technicalOwnerId === undefined ? current.technicalOwnerId : (input.technicalOwnerId ?? null),
      businessOwnerId:
        input.businessOwnerId === undefined ? current.businessOwnerId : (input.businessOwnerId ?? null),
      supportOwnerId:
        input.supportOwnerId === undefined ? current.supportOwnerId : (input.supportOwnerId ?? null),
    };

    /*
     * OWN_APP HOLDS ACROSS OWNER-SLOT CHANGES. Both refusals are explained at
     * OWNER_RELEASE_WHILE_PENDING and OWNER_CLAIM_BY_DECIDER: without them an
     * owner could release every slot, approve their own app's PROD write, and
     * reclaim the slots — three self-service calls, each one allowed. Checked
     * before anything is written, so a refused save changes nothing.
     *
     * Only the caller stepping down from their last slot waits on a pending
     * request. Clearing a stale or a colleague's slot, or moving between slots,
     * never makes the caller a non-owner, so it stays open — that is how a
     * departed owner's slot is recovered while a request sits in the queue.
     */
    if (stepsCallerDown(current, nextOwnership, user.id)) {
      const awaitingDecision = await tx.apiAccessGrant.findFirst({
        where: { organizationId, solutionId: current.id, decision: "REQUESTED" },
        select: { id: true },
      });
      if (awaitingDecision) return { refusal: studioError("CONFLICT", OWNER_RELEASE_WHILE_PENDING) };
    }
    if (claimedOwnerSlots(current, nextOwnership, user.id).length > 0) {
      const now = new Date();
      const decidedByCaller = await tx.apiAccessGrant.findMany({
        where: { organizationId, solutionId: current.id, decidedById: user.id },
        select: { decision: true, expiresAt: true, revokedAt: true },
      });
      // "Live" through the one resolver every surface uses, so a lapsed or
      // revoked grant — which authorises nothing — never blocks a claim. Nor
      // does a rejection, which never authorised anything: exempt on purpose,
      // see OWNER_CLAIM_BY_DECIDER.
      const stillAuthorises = decidedByCaller.some((g) => {
        const effective = effectiveDecision(g, now);
        return effective !== "REVOKED" && isGranting(effective);
      });
      if (stillAuthorises) return { refusal: studioError("FORBIDDEN", OWNER_CLAIM_BY_DECIDER) };
    }

    const requestedStatus = (input.status ?? current.status) as SolutionStatus;
    const currentStatus = current.status as SolutionStatus;

    // Promoting into ACTIVE from anywhere else must satisfy the gate outright —
    // refused, not silently downgraded, because a promotion that quietly did not
    // happen is worse than one that was clearly declined.
    const isPromotion = requestedStatus === "ACTIVE" && currentStatus !== "ACTIVE";
    if (isPromotion) {
      const verdict = evaluatePromotion(nextOwnership);
      if (!verdict.ok) return { refusal: studioError("CONFLICT", verdict.reason) };
    }

    // An ALREADY-active solution that just lost an owner is a different case: the
    // caller is not promoting, they are orphaning. Drop it rather than refuse,
    // so the record can never sit ACTIVE with nobody accountable.
    const resolution = isOrphaningAnActiveSolution(currentStatus, requestedStatus, nextOwnership)
      ? resolveStatusOnSave(requestedStatus, nextOwnership)
      : { status: requestedStatus, autoDropped: false as const };

    /*
     * RETIRING CLOSES THE KEY LINKS THAT ARE STILL OUT. Retirement changed only
     * this row, so a claim link sent while the app was live stayed live for the
     * rest of its window and, once opened, minted a key for a retired app —
     * refused today, working again the moment someone set the app back to DRAFT.
     * Closed before the status is written, so a failure between the two leaves a
     * dead link on a live app rather than a live link on a retired one. (It
     * writes through its own connection and commits ahead of this transaction,
     * which keeps exactly that order; it touches no Solution row, so it never
     * waits on the lock held here.)
     */
    if (resolution.status === "RETIRED" && currentStatus !== "RETIRED") {
      await closePendingClaimLinks({ organizationId, solutionId: current.id }, "The app was retired.");
    }

    const updated = await tx.solution.update({
      where: { id: current.id, organizationId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.classification !== undefined ? { classification: input.classification } : {}),
        ...(input.businessProblem !== undefined ? { businessProblem: input.businessProblem } : {}),
        ...(input.dataClass !== undefined ? { dataClass: input.dataClass } : {}),
        ...(input.repoUrl !== undefined ? { repoUrl: input.repoUrl ?? null } : {}),
        ...(input.packagingNote !== undefined ? { packagingNote: input.packagingNote ?? null } : {}),
        ...(input.reuseIntent !== undefined ? { reuseIntent: input.reuseIntent ?? null } : {}),
        technicalOwnerId: nextOwnership.technicalOwnerId,
        businessOwnerId: nextOwnership.businessOwnerId,
        supportOwnerId: nextOwnership.supportOwnerId,
        status: resolution.status,
      },
      select: {
        id: true,
        name: true,
        status: true,
        technicalOwnerId: true,
        businessOwnerId: true,
        supportOwnerId: true,
        repoUrl: true,
      },
    });

    return { current, updated, isPromotion, resolution };
  });
  if ("refusal" in saved) return saved.refusal;
  const { current, updated, isPromotion, resolution } = saved;

  await writeConfigAudit({
    organizationId,
    actorId: user.id,
    entityType: "Solution",
    entityId: current.id,
    // A promotion is a different kind of event from an edit, and the audit says so.
    action: isPromotion ? "PROMOTE" : "UPDATE",
    before: current,
    after: { ...updated, autoDropped: resolution.autoDropped },
  });

  return studioOk({
    ...updated,
    autoDropped: resolution.autoDropped,
    ...(resolution.autoDropped ? { autoDropReason: resolution.reason } : {}),
  });
}
