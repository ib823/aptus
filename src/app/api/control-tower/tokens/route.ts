/**
 * GET /api/control-tower/tokens — the credential register.
 *
 * THE GOVERNANCE VIEW, not the operational one. The Operations Center asks
 * whether a credential is working; this asks whether issuing it was
 * accountable — who owns the solution it belongs to, whether all three owner
 * slots were filled, and whether the person who issued it was someone other
 * than an owner.
 *
 * SEGREGATION OF DUTIES IS RENDERED, NOT ASSUMED. Issuance requires complete
 * ownership and refuses anyone who is themselves an owner. That is the control
 * that makes a credential reviewable, and this register is where a reviewer
 * checks it actually held — so `issuedBy` is reported against the owner set
 * rather than left as an id nobody cross-references.
 *
 * ONE CREDENTIAL PER SOLUTION. Issuance upserts on the solution, so re-issuing
 * REPLACES the previous token and its environment rather than adding one. The
 * register must never imply concurrent credentials, because an operator who
 * believed that would go looking for tokens to revoke that do not exist.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { opsWhere, requireControlTower } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";
import { missingOwners } from "@/lib/studio/solutions";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const guard = await requireControlTower();
  if (!guard.ok) return guard.response;

  const now = new Date();
  const where = opsWhere(guard.actor, {});

  const [rows, solutions, withWriteSecret] = await Promise.all([
    prisma.solutionClient.findMany({
      where,
      select: {
        id: true,
        solutionId: true,
        label: true,
        environment: true,
        isActive: true,
        createdById: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        // tokenHash and secretsCiphertext are NOT selected.
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.solution.findMany({
      where: opsWhere(guard.actor, {}),
      select: {
        id: true,
        name: true,
        status: true,
        technicalOwnerId: true,
        businessOwnerId: true,
        supportOwnerId: true,
      },
    }),
    prisma.solutionClient.count({ where: { ...where, secretsCiphertext: { not: null } } }),
  ]);

  const solutionBy = new Map(solutions.map((s) => [s.id, s]));

  const credentials = rows.map((c) => {
    const solution = solutionBy.get(c.solutionId);
    const owners = solution
      ? [solution.technicalOwnerId, solution.businessOwnerId, solution.supportOwnerId]
      : [];
    const revoked = c.revokedAt !== null || !c.isActive;
    const expired = !revoked && c.expiresAt !== null && c.expiresAt.getTime() <= now.getTime();

    return {
      id: c.id,
      solutionId: c.solutionId,
      solutionName: solution?.name ?? null,
      solutionStatus: solution?.status ?? null,
      label: c.label,
      environment: c.environment,
      state: revoked ? "revoked" : expired ? "expired" : "active",
      /**
       * Whether the control actually held for THIS credential.
       *
       * `null` where the solution is not in scope — unknowable rather than
       * false, and the difference matters on a governance screen.
       */
      segregation:
        solution === undefined
          ? null
          : {
              issuedById: c.createdById,
              issuerWasAnOwner: owners.includes(c.createdById),
              ownershipComplete: missingOwners(solution).length === 0,
              missingOwners: missingOwners(solution),
            },
      lastObservedUseAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
      expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
      revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return studioOk({
    scope: guard.actor.kind,
    counts: {
      total: credentials.length,
      active: credentials.filter((c) => c.state === "active").length,
      revoked: credentials.filter((c) => c.state === "revoked").length,
      expired: credentials.filter((c) => c.state === "expired").length,
      withWriteSecret,
      /** Should always be zero. A non-zero is a control that did not hold. */
      issuedByAnOwner: credentials.filter((c) => c.segregation?.issuerWasAnOwner === true).length,
      neverExpires: credentials.filter((c) => c.expiresAt === null && c.state === "active").length,
    },
    delegatedActions: [
      {
        id: "credential-rotate-revoke",
        label: "Rotate or revoke a credential",
        availableTo: "consultant",
        where: "Developer Studio → Solutions",
        why: "Rotation and revocation are the builder's actions on their own solution. Control Tower observes them; it does not perform them.",
      },
    ],
    provenance: {
      oneCredentialPerSolution:
        "Issuance upserts on the solution, so re-issuing replaces the previous token and its environment rather than adding one. A solution never holds two live credentials, and this register must not be read as though it could.",
      segregationIsRecorded:
        "issuedBy is checked against the solution's three owner slots. Issuance refuses an owner, so issuedByAnOwner should be zero — a non-zero means the control did not hold for that row and is worth investigating rather than dismissing.",
      lastUsedUnderReports:
        "lastUsedAt is written fire-and-forget and often does not land. It is last OBSERVED use, and is not on its own sufficient to conclude a credential is dormant.",
      secretsAreCountedNeverRead:
        "Neither the token hash nor the sealed write secret is selected by this query.",
      countsAreComplete: "Every credential in scope is listed. There is no sampling and no page.",
    },
    credentials,
  });
}
