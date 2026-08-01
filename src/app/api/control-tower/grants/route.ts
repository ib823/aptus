/**
 * GET /api/control-tower/grants — the access-grant governance view.
 *
 * WHAT THIS IS FOR: seeing which capabilities have been asked for, what was
 * decided, by whom, and when each decision stops being true — and, in PATCH
 * below, deciding the ones still pending. The read is open to every Control
 * Tower role; the decision is admin-only, and the two gates are separate.
 *
 * THE DECISION VOCABULARY IS NOW ENFORCED, AND THE VIEW REFLECTS THAT. Until
 * PR #168, `READ_ONLY` and `SANDBOX_ONLY` authorised writes at runtime — the
 * broker asked only "is this granting?". They now mean what they say, so the
 * screen can render them as real restrictions rather than as labels that
 * described an intention nobody enforced.
 *
 * EXPIRY IS THE ONLY WAY A GRANT ENDS. Revocation is deferred by decision, and
 * a settled grant cannot be re-decided. So a write-granting decision cannot be
 * approved without an expiry, and time-remaining is a first-class property here
 * rather than a date in a cell — it is the entire lifecycle control.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { opsLimit, opsWhere, requireControlTower } from "@/lib/ops/guard";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import {
  evaluateDecision,
  grantsRead,
  grantsWrite,
  isWriteOperation,
  type GrantDecision,
  type GrantEnvironment,
  type GrantOperation,
} from "@/lib/studio/grants";
import { canMutateControlTower } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";

/** Inside this window an expiry is close enough that someone must act. */
const EXPIRING_SOON_DAYS = 14;

export async function GET(request: NextRequest) {
  const guard = await requireControlTower();
  if (!guard.ok) return guard.response;

  const limit = opsLimit(request.nextUrl.searchParams.get("limit"), 200, 500);
  const now = new Date();
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

  const where = opsWhere(guard.actor, {});

  const [total, rows, byDecision, solutions] = await Promise.all([
    prisma.apiAccessGrant.count({ where }),
    prisma.apiAccessGrant.findMany({
      where,
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
        createdAt: true,
        revokedAt: true,
        revokedById: true,
        revokedReason: true,
      },
      // Pending first: the queue is the thing this screen exists for.
      orderBy: [{ decision: "asc" }, { createdAt: "desc" }],
      take: limit,
    }),
    prisma.apiAccessGrant.groupBy({ by: ["decision"], where, _count: { _all: true } }),
    prisma.solution.findMany({ where: opsWhere(guard.actor, {}), select: { id: true, name: true } }),
  ]);

  const nameBy = new Map(solutions.map((s) => [s.id, s.name]));
  const decisionCounts: Record<string, number> = {};
  for (const g of byDecision) decisionCounts[g.decision] = g._count._all;

  const grants = rows.map((g) => {
    const decision = g.decision as GrantDecision;
    const environment = g.environment as GrantEnvironment;
    const operation = g.operation as GrantOperation;
    const isWrite = isWriteOperation(operation);
    const expired = g.expiresAt !== null && g.expiresAt.getTime() <= now.getTime();
    // Withdrawn by a human. Distinct from lapsed: the clock did not do this.
    const revoked = g.revokedAt != null;

    return {
      id: g.id,
      solutionId: g.solutionId,
      // Null when the solution is not in this tenant — stated rather than
      // defaulted to a plausible string.
      solutionName: nameBy.get(g.solutionId) ?? null,
      externalId: g.externalId,
      operation: g.operation,
      environment: g.environment,
      justification: g.justification,
      decision: g.decision,
      requestedById: g.requestedById,
      decidedById: g.decidedById,
      decidedAt: g.decidedAt ? g.decidedAt.toISOString() : null,
      expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
      createdAt: g.createdAt.toISOString(),
      /*
       * Revocation is reported ALONGSIDE the decision, never instead of it.
       * `decision` above still reads APPROVED on a revoked grant, because the
       * approval happened and the ledger's job is to say so.
       */
      revokedAt: g.revokedAt ? g.revokedAt.toISOString() : null,
      revokedById: g.revokedById,
      revokedReason: g.revokedReason,

      /**
       * What this decision authorises AT RUNTIME, computed with the same
       * predicates the broker enforces with.
       *
       * Rendering the decision label alone would repeat the defect #168 fixed
       * from the other direction: a viewer would read "SANDBOX_ONLY" on a PROD
       * grant and have to know, from elsewhere, that it authorises nothing.
       */
      authorises: {
        read: !revoked && !expired && grantsRead(decision, environment),
        write: !revoked && !expired && isWrite && grantsWrite(decision, environment),
      },
      lifecycle: revoked
        ? ("revoked" as const)
        : expired
        ? ("lapsed" as const)
        : g.expiresAt !== null && g.expiresAt.getTime() <= soon.getTime()
          ? ("expiring-soon" as const)
          : g.decidedAt === null
            ? ("pending" as const)
            : ("live" as const),
      /**
       * A settled grant with no expiry and no revocation is permanent. Once
       * revocation exists this is a fixable state rather than a terminal one,
       * but it is still the thing to fix — so it keeps being reported.
       */
      unbounded: !revoked && !expired && g.decidedAt !== null && g.expiresAt === null,
    };
  });

  return studioOk({
    scope: guard.actor.kind,
    expiryRunwayDays: EXPIRING_SOON_DAYS,
    counts: {
      total,
      byDecision: decisionCounts,
      pending: grants.filter((g) => g.lifecycle === "pending").length,
      expiringSoon: grants.filter((g) => g.lifecycle === "expiring-soon").length,
      lapsed: grants.filter((g) => g.lifecycle === "lapsed").length,
      revoked: grants.filter((g) => g.lifecycle === "revoked").length,
      unbounded: grants.filter((g) => g.unbounded).length,
    },
    truncated: total > rows.length,
    provenance: {
      howAGrantEnds:
        "A grant ends in one of two ways: it lapses at its expiry, or an admin revokes it. Revocation is NOT a re-decision — the decision column is left exactly as it was, and the withdrawal is recorded beside it with its actor, timestamp and stated reason, so both facts survive. A settled grant still cannot be re-decided; that is what keeps the ledger honest.",
      whyExpiryIsStillRequired:
        "Expiry remains mandatory on any granting decision. Revocation is a manual act that depends on somebody noticing; an expiry ends a grant whether or not anyone is watching, which is the stronger control.",
      restrictionsAreEnforced:
        "READ_ONLY and SANDBOX_ONLY are enforced at runtime on every call. `authorises` is computed with the same predicates the broker uses, so the decision label and what it actually permits cannot drift apart on this screen.",
      emptyByDesign:
        total === 0
          ? "No grant has been requested yet. The request dialog is live in Developer Studio; until a consultant raises one, this queue is empty because nothing has been asked for."
          : null,
      decisionsAreAudited:
        "Every decision writes a ConfigAudit entry, and the requester may not be the approver.",
      grantsAreAPage: { returned: rows.length, limit, of: total },
    },
    grants,
  });
}

/**
 * PATCH /api/control-tower/grants — the one permitted mutation in this workspace.
 *
 * A NEW CAPABILITY, NOT A RE-USED ONE. Developer Studio already has a decision
 * path, and it is gated by `requireBuilder()` → `canMutateStudio`, which returns
 * FALSE for `platform_admin` deliberately. The tempting shortcut is to widen
 * that predicate so the admin can reach the existing route. That would be wrong
 * twice over: it would hand an admin every other builder mutation as a side
 * effect, and it would silently change what "may mutate Studio" means for every
 * caller of a function used across the workspace.
 *
 * So this is a second, separately-gated path onto the SAME semantics.
 * `evaluateDecision` is imported, not reimplemented — the segregation rule, the
 * write checklist and the mandatory expiry are one piece of logic with two
 * doors. A copy would drift, and the thing it would drift on is the control
 * that makes the ledger worth keeping.
 *
 * READING IS NOT DECIDING. `requireControlTower` admits partner_lead,
 * executive_sponsor and project_manager. None of them may decide: the mutation
 * check is `canMutateControlTower`, which is admin-only, and it is applied AFTER
 * the workspace gate and BEFORE the grant is looked up — so a viewer's refusal
 * cannot be used to discover whether a grant id exists.
 */

const decisionSchema = z.object({
  grantId: z.string().min(1),
  decision: z.enum(["APPROVED", "SANDBOX_ONLY", "READ_ONLY", "REJECTED"]),
  /** The approver has explicitly worked through the write checklist. */
  writeChecklistAcknowledged: z.boolean().optional().default(false),
});

export async function PATCH(request: NextRequest) {
  const guard = await requireControlTower();
  if (!guard.ok) return guard.response;

  // Entitlement to read this workspace is not entitlement to act in it.
  // Checked before the lookup, so a 403 says nothing about which ids exist.
  const user = await getCurrentUser();
  if (!user || !canMutateControlTower(user.role)) {
    return studioError(
      "FORBIDDEN",
      "Only a platform admin may decide an access request. Control Tower's other roles are read-only.",
    );
  }

  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid decision.");
  const input = parsed.data;

  const grant = await prisma.apiAccessGrant.findFirst({
    where: opsWhere(guard.actor, { id: input.grantId }),
    select: {
      id: true,
      // Read explicitly: a GLOBAL admin's `where` carries no organization, so
      // the row's own tenant is the only thing that can anchor the write and
      // the audit entry below.
      organizationId: true,
      decision: true,
      operation: true,
      environment: true,
      requestedById: true,
      externalId: true,
      solutionId: true,
      expiresAt: true,
    },
  });
  if (!grant) return studioError("NOT_FOUND", "Request not found.");

  const verdict = evaluateDecision({
    current: grant.decision as GrantDecision,
    operation: grant.operation as GrantOperation,
    environment: grant.environment as GrantEnvironment,
    requestedById: grant.requestedById,
    deciderId: user.id,
    next: input.decision as GrantDecision,
    writeChecklistAcknowledged: input.writeChecklistAcknowledged,
    // Taken from the REQUEST, not from this decision — an approver may not
    // invent the boundary on a write they are approving. Same rule as the
    // Studio path, and for the same reason: a write request that arrived with
    // no expiry is refused and re-raised, leaving both rows in the ledger.
    expiresAt: grant.expiresAt,
  });

  if (!verdict.ok) {
    // CONFLICT for "already settled", FORBIDDEN for the governance controls —
    // the distinction tells a caller whether to retry or to find a colleague.
    const code = verdict.reason === "NOT_PENDING" ? "CONFLICT" : "FORBIDDEN";
    return studioError(code, verdict.message);
  }

  const before = { decision: grant.decision, decidedById: null, decidedAt: null };

  const updated = await prisma.apiAccessGrant.update({
    // Tenant-anchored in the write itself, from the row's own organization —
    // never from the actor, who may be a global admin with none.
    where: { id: grant.id, organizationId: grant.organizationId },
    data: {
      decision: input.decision,
      decidedById: user.id,
      decidedAt: new Date(),
    },
    select: {
      id: true,
      decision: true,
      decidedById: true,
      decidedAt: true,
      operation: true,
      environment: true,
      externalId: true,
      solutionId: true,
      expiresAt: true,
    },
  });

  await writeConfigAudit({
    organizationId: grant.organizationId,
    actorId: user.id,
    entityType: "ApiAccessGrant",
    entityId: grant.id,
    action: "DECISION",
    before,
    after: {
      ...updated,
      decidedAt: updated.decidedAt?.toISOString() ?? null,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      // Recorded so the trail shows WHERE the decision was taken. The same
      // decision from two workspaces is two different governance events.
      decidedIn: "control-tower",
    },
  });

  return studioOk({
    id: updated.id,
    decision: updated.decision,
    decidedById: updated.decidedById,
    decidedAt: updated.decidedAt?.toISOString() ?? null,
    expiresAt: updated.expiresAt?.toISOString() ?? null,
    /** What this decision authorises from now on, by the runtime predicates. */
    authorises: {
      read: grantsRead(updated.decision as GrantDecision, updated.environment as GrantEnvironment),
      write:
        isWriteOperation(updated.operation as GrantOperation) &&
        grantsWrite(updated.decision as GrantDecision, updated.environment as GrantEnvironment),
    },
  });
}
