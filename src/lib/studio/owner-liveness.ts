/**
 * Owner liveness: a departed owner is no owner (P0.1, audit A69).
 *
 * THE DEFECT. Ownership was "the three owner ids are non-null". The columns
 * have no foreign key and nothing re-checked them: deactivating a user,
 * deleting one, or moving one to another organization (accepting an
 * invitation) left their id in the slot. An app whose owners had all left
 * stayed ACTIVE, never dropped to RESTRICTED, and still passed the credential
 * gates — any non-owner could issue or rotate its PROD key, with the
 * accountability record naming nobody who could still answer for it.
 *
 * THE RULE. An owner id counts only while it resolves to an ACTIVE user of
 * the SAME organization. Three consumers:
 *
 *   - The credential gates (issue, rotate, write key, claim link) judge
 *     ownership on live owners, so a departed owner's slot reads as empty.
 *   - The promotion to ACTIVE in the solutions PATCH, so a bare "Promote to
 *     ACTIVE" cannot undo the sweep while the departed owner still holds the
 *     slot (review round 1).
 *   - The nightly sweep (`sweepOwnerLiveness`, riding the northbound-reap
 *     cron and its job lease) drops every ACTIVE app with a slot that has no
 *     live owner to RESTRICTED and audits the drop. RESTRICTED stops no
 *     runtime call (lib/northbound/auth.ts): it is the governance flag that
 *     tells the team to recover the slot.
 *
 * OWN_APP is deliberately NOT judged on live owners: a departed owner cannot
 * sign in to decide anything, and treating their id as still theirs is the
 * conservative reading for a refusal.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { permitCrossTenantReads } from "@/lib/db/tenant-guard";
import { lockSolutionOwnership } from "@/lib/studio/owner-lock";
import { OWNER_FIELDS, hasCompleteOwnership, missingOwners, type Ownership, type OwnerField } from "@/lib/studio/solutions";

type UserLookupDb = { user: { findMany: Prisma.TransactionClient["user"]["findMany"] } };

export interface LiveOwnership {
  /** The ownership with every departed owner's slot read as empty. */
  readonly live: Ownership;
  /** Slots holding an id that is not a live user of this organization. */
  readonly departed: readonly OwnerField[];
}

/** Which of these ids are active users of this organization. */
async function liveUserIds(
  db: UserLookupDb,
  organizationId: string,
  ids: readonly (string | null)[],
): Promise<Set<string>> {
  const named = [...new Set(ids.filter((id): id is string => id !== null))];
  if (named.length === 0) return new Set();
  const users = await db.user.findMany({
    where: { id: { in: named }, organizationId, isActive: true },
    select: { id: true },
  });
  return new Set(users.map((u) => u.id));
}

/**
 * Is this person still an active member of this organization? The liveness
 * an owner slot is judged on, asked of one person — the sender of a claim
 * link, who issues its key up to 72 hours after sending it (review round 2).
 */
export async function isLiveMember(db: UserLookupDb, organizationId: string, userId: string): Promise<boolean> {
  return (await liveUserIds(db, organizationId, [userId])).has(userId);
}

/** Apply a known set of live ids to one app's slots. */
export function applyLiveness(ownership: Ownership, live: ReadonlySet<string>): LiveOwnership {
  const departed: OwnerField[] = [];
  const next = { ...ownership };
  for (const field of OWNER_FIELDS) {
    const id = ownership[field];
    if (id !== null && !live.has(id)) {
      departed.push(field);
      next[field] = null;
    }
  }
  return { live: next, departed };
}

/** One app's ownership as it stands for accountability: departed owners removed. */
export async function liveOwnership(
  db: UserLookupDb,
  organizationId: string,
  ownership: Ownership,
): Promise<LiveOwnership> {
  const live = await liveUserIds(db, organizationId, [
    ownership.technicalOwnerId,
    ownership.businessOwnerId,
    ownership.supportOwnerId,
  ]);
  return applyLiveness(ownership, live);
}

/**
 * Why this person may not issue this app's runtime credential, or null — the
 * two-human rule every door that mints a key shares (Studio issue and rotate,
 * the write key, the CoreEdge claim link), on LIVE owners.
 *
 * All three slots held by active members of the organization FIRST (on an
 * unowned app the second check is vacuously true — [null, null, null]
 * contains nobody), and then the issuer is none of them. `missing` names the
 * roles to fill, a departed owner's included.
 */
export async function refuseCredentialIssuerLive(
  db: UserLookupDb,
  organizationId: string,
  ownership: Ownership,
  issuerId: string,
): Promise<{ refusal: "ownersMissing"; missing: string[]; departed: readonly OwnerField[] } | { refusal: "issuerIsOwner" } | null> {
  const { live, departed } = await liveOwnership(db, organizationId, ownership);
  const missing = missingOwners(live);
  if (missing.length > 0) return { refusal: "ownersMissing", missing, departed };
  if ([live.technicalOwnerId, live.businessOwnerId, live.supportOwnerId].includes(issuerId)) {
    return { refusal: "issuerIsOwner" };
  }
  return null;
}

/** The audit actor for a status change the sweep makes. Not a user id. */
export const OWNER_LIVENESS_ACTOR = "system:owner-liveness";

export interface OwnerLivenessResult {
  readonly checked: number;
  readonly restricted: number;
  /** Apps that changed between the scan and the locked re-read and were left alone. */
  readonly skipped: number;
}

/**
 * The nightly sweep: every ACTIVE app with a slot no live owner holds drops
 * to RESTRICTED, with a ConfigAudit row naming the slots and why.
 *
 * Each drop happens in its own transaction, under the Solution row lock every
 * owner-slot write and decision takes (owner-lock.ts), and on a re-read made
 * while holding it — so a colleague reclaiming the slot at the same moment
 * either lands first (and the app is left ACTIVE) or after (and finds it
 * RESTRICTED, which their own save can promote again). The status is all it
 * writes; the stale ids stay in their slots, visible and recoverable.
 */
export async function sweepOwnerLiveness(
  /** Only these organizations' apps (tests, and an operator re-running one tenant); default every one. */
  options: { readonly organizationIds?: readonly string[] } = {},
): Promise<OwnerLivenessResult> {
  permitCrossTenantReads("owner-liveness: nightly sweep over every tenant's ACTIVE apps");

  const active = await prisma.solution.findMany({
    where: {
      status: "ACTIVE",
      ...(options.organizationIds ? { organizationId: { in: [...options.organizationIds] } } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      technicalOwnerId: true,
      businessOwnerId: true,
      supportOwnerId: true,
    },
  });

  // One user lookup for the whole scan, then the same rule per app.
  const ids = [...new Set(active.flatMap((s) => [s.technicalOwnerId, s.businessOwnerId, s.supportOwnerId]))].filter(
    (id): id is string => id !== null,
  );
  const users =
    ids.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: ids }, isActive: true },
          select: { id: true, organizationId: true },
        });
  const liveIn = new Map<string, Set<string>>();
  for (const u of users) {
    if (u.organizationId === null) continue;
    const set = liveIn.get(u.organizationId) ?? new Set<string>();
    set.add(u.id);
    liveIn.set(u.organizationId, set);
  }

  let restricted = 0;
  let skipped = 0;
  for (const app of active) {
    const scanned = applyLiveness(app, liveIn.get(app.organizationId) ?? new Set());
    if (hasCompleteOwnership(scanned.live)) continue;

    const dropped = await prisma.$transaction(async (tx) => {
      await lockSolutionOwnership(tx, { organizationId: app.organizationId, solutionId: app.id });
      const current = await tx.solution.findFirst({
        where: { id: app.id, organizationId: app.organizationId },
        select: { status: true, technicalOwnerId: true, businessOwnerId: true, supportOwnerId: true },
      });
      if (current === null || current.status !== "ACTIVE") return false;
      const { live, departed } = await liveOwnership(tx, app.organizationId, current);
      if (hasCompleteOwnership(live)) return false;

      await tx.solution.update({
        where: { id: app.id, organizationId: app.organizationId },
        data: { status: "RESTRICTED" },
      });
      // In the same transaction as the drop: a status change with no record of
      // who made it, or why, is the unreviewable change this trail exists for.
      await tx.configAudit.create({
        data: {
          organizationId: app.organizationId,
          actorId: OWNER_LIVENESS_ACTOR,
          entityType: "Solution",
          entityId: app.id,
          action: "UPDATE",
          before: current as never,
          after: {
            status: "RESTRICTED",
            autoDropped: true,
            reason: `No live owner holds the ${missingOwners(live).join(", ")} slot${missingOwners(live).length === 1 ? "" : "s"}; the app was moved to RESTRICTED by the nightly owner check.`,
            departedSlots: departed,
          } as never,
        },
      });
      return true;
    });
    if (dropped) restricted++;
    else skipped++;
  }

  return { checked: active.length, restricted, skipped };
}
