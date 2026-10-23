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
 *
 * EXPIRY IS NOW A CONTROL, NOT A PREFERENCE (P0.11). A TEST or PROD key must
 * expire, so one that does not is reported as `expiryRequired: true` and
 * counted in `noRequiredExpiry` — it predates the rule, still works, and
 * should be rotated. An expired key is `expired`, never `active`.
 *
 * WRITE KEYS ARE COUNTED ON LIVE CREDENTIALS ONLY (P0.3 review round 3, A62).
 * A revocation clears the sealed write key; an expiry does not. Counted over
 * every row, an expired credential's write key read as a usable write path —
 * one that can never be presented, because its bearer token is refused
 * first — and this register disagreed with Operations > Tokens, which counts
 * with the same predicate authentication uses (`liveKeyWhere`). A retired
 * app's credentials are left out too (review round 4): retiring does not
 * revoke them, and authentication refuses them SOLUTION_RETIRED
 * (ops/write-keys.ts `countPresentableWriteKeys`).
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { keyState, lacksRequiredExpiry, requiresExpiry } from "@/lib/northbound/key-policy";
import { opsWhere, requireControlTower } from "@/lib/ops/guard";
import { countPresentableWriteKeys } from "@/lib/ops/write-keys";
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
    countPresentableWriteKeys(guard.actor, now),
  ]);

  const solutionBy = new Map(solutions.map((s) => [s.id, s]));

  const credentials = rows.map((c) => {
    const solution = solutionBy.get(c.solutionId);
    const owners = solution
      ? [solution.technicalOwnerId, solution.businessOwnerId, solution.supportOwnerId]
      : [];
    // The predicate authentication uses (key-policy.ts): an expired key is
    // never reported as active.
    const state = keyState(c, now);
    const revoked = state === "revoked" || state === "inactive";
    const expired = state === "expired";

    return {
      id: c.id,
      solutionId: c.solutionId,
      solutionName: solution?.name ?? null,
      solutionStatus: solution?.status ?? null,
      label: c.label,
      environment: c.environment,
      state: revoked ? "revoked" : expired ? "expired" : "active",
      /** True where this environment's keys must expire (TEST, PROD) — P0.11. */
      expiryRequired: requiresExpiry(c.environment),
      /** A live key that must expire and does not: "no expiry - set one". */
      lacksRequiredExpiry: lacksRequiredExpiry(c, now),
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
      /** Write keys on live credentials: the ones a caller could present now. */
      withWriteSecret,
      /** Should always be zero. A non-zero is a control that did not hold. */
      issuedByAnOwner: credentials.filter((c) => c.segregation?.issuerWasAnOwner === true).length,
      neverExpires: credentials.filter((c) => c.expiresAt === null && c.state === "active").length,
      /** Of those, the TEST and PROD keys — the ones the policy now forbids (P0.11). */
      noRequiredExpiry: credentials.filter((c) => c.lacksRequiredExpiry).length,
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
        "Issuance upserts on (solution, environment): re-issuing for the same environment replaces the previous token rather than adding one, and a different environment adds a credential beside it. A solution holds at most one live credential per environment, so two rows for one solution are two environments, not a duplicate.",
      segregationIsRecorded:
        "issuedBy is checked against the solution's three owner slots. Issuance refuses an owner, so issuedByAnOwner should be zero — a non-zero means the control did not hold for that row and is worth investigating rather than dismissing.",
      lastUsedUnderReports:
        "lastUsedAt is written fire-and-forget and often does not land. It is last OBSERVED use, and is not on its own sufficient to conclude a credential is dormant.",
      secretsAreCountedNeverRead:
        "Neither the token hash nor the sealed write secret is selected by this query.",
      writeSecrets:
        "withWriteSecret counts write keys on live credentials only (active, not revoked, not expired, and of an app that is not retired), the predicates authentication uses and the count Operations > Tokens shows. An expired credential, or a retired app's, keeps its sealed write key, but its bearer token is refused first, so that key is not a usable write path.",
      countsAreComplete: "Every credential in scope is listed. There is no sampling and no page.",
    },
    credentials,
  });
}
