/**
 * GET /api/control-tower/grants — the access-grant governance view.
 *
 * WHAT THIS IS FOR: seeing which capabilities have been asked for, what was
 * decided, by whom, and when each decision stops being true. It is the read
 * half. The admin decision path is a separate, deliberate mutation and is not
 * in this file.
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

import { prisma } from "@/lib/db/prisma";
import { opsLimit, opsWhere, requireControlTower } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";
import {
  grantsRead,
  grantsWrite,
  isWriteOperation,
  type GrantDecision,
  type GrantEnvironment,
  type GrantOperation,
} from "@/lib/studio/grants";

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

      /**
       * What this decision authorises AT RUNTIME, computed with the same
       * predicates the broker enforces with.
       *
       * Rendering the decision label alone would repeat the defect #168 fixed
       * from the other direction: a viewer would read "SANDBOX_ONLY" on a PROD
       * grant and have to know, from elsewhere, that it authorises nothing.
       */
      authorises: {
        read: !expired && grantsRead(decision, environment),
        write: !expired && isWrite && grantsWrite(decision, environment),
      },
      lifecycle: expired
        ? ("lapsed" as const)
        : g.expiresAt !== null && g.expiresAt.getTime() <= soon.getTime()
          ? ("expiring-soon" as const)
          : g.decidedAt === null
            ? ("pending" as const)
            : ("live" as const),
      /** A settled write grant with no expiry would be permanent — it cannot be. */
      unbounded: !expired && g.decidedAt !== null && g.expiresAt === null,
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
    },
    truncated: total > rows.length,
    provenance: {
      expiryIsTheOnlyEnd:
        "There is no revocation path in this release. A settled grant cannot be re-decided, so an approved grant ends only by lapsing — which is why a write-granting decision cannot be settled without an expiry date.",
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
