/**
 * Grant binding: one approval authorises ONE interface, on ONE product (P0.1, A47).
 *
 * THE DEFECT. A request is raised against one concrete Interface, but the
 * ApiAccessGrant row stored only (solution, externalId, operation,
 * environment), and the broker re-derived authority from that tuple. A
 * builder who later added an interface with the same externalId on another
 * SAP product — `s4hana-onprem` beside `s4hana` — was served from that system
 * at once, on an approval nobody gave for it.
 *
 * THE RULE. A grant carries the interface it was decided for
 * (`ApiAccessGrant.interfaceId`) and that interface's product (`sapProduct`).
 * A bound grant authorises only its own interface, and only while the
 * interface still names the same service, operation and product. Every
 * request is bound when it is raised, and every decision binds the request it
 * settles: an unbound request cannot be approved.
 *
 * LEGACY GRANTS. The P0.1 migration bound each existing grant to the single
 * interface it authorised that day. A grant that matched none, or several,
 * stays unbound (`unboundReason`) and is flagged for re-approval where
 * approvers look. What an unbound grant may do is a deployment setting, so
 * that no call that worked before the deploy stops without an operator
 * choosing it:
 *
 *   COREEDGE_GRANT_BINDING=legacy (default) — an unbound grant keeps the old
 *     tuple matching on the interfaces that existed at the deploy
 *     (`unboundCutoffAt`; one added since needs a bound grant in either
 *     mode), and each call it authorises stamps `unboundLastUsedAt` (at most
 *     hourly per grant), so the operator can see what strict would refuse.
 *   COREEDGE_GRANT_BINDING=strict — an unbound grant authorises nothing; the
 *     access check's reason is GRANT_NEEDS_REAPPROVAL, sent to the caller as a
 *     403 FORBIDDEN whose message asks for re-approval.
 *
 * `pnpm grants:binding` counts the unbound grants (and with --apply binds the
 * ones the old code created during the rollout; a flagged grant is never
 * auto-bound), so strict is switched on once the count of live, used ones is
 * zero. The runbook is docs/runbooks/coreedge-grant-binding.md.
 */

import { Prisma } from "@prisma/client";

export type GrantBindingMode = "legacy" | "strict";

/** The setting. Anything unrecognised reads as legacy: it is the mode that refuses nothing new. */
export function grantBindingMode(env: NodeJS.ProcessEnv = process.env): GrantBindingMode {
  return env.COREEDGE_GRANT_BINDING?.trim().toLowerCase() === "strict" ? "strict" : "legacy";
}

/** Why a legacy grant could not be bound. */
export type UnboundReason = "NO_MATCH" | "AMBIGUOUS";

/** The interface fields a grant is matched on. */
export interface GrantedInterface {
  readonly id: string;
  readonly externalId: string;
  readonly operation: string;
  readonly sapProduct: string;
  /** Judged against an unbound grant's legacy cut-off (`isUsableUnder`), with the next field. */
  readonly createdAt: Date;
  /**
   * When a PATCH last moved the interface onto its current externalId or
   * operation, or null if it never has. Required, like `createdAt`, so no
   * caller judges the cut-off on the creation time alone (`grantMatchSince`).
   */
  readonly grantMatchChangedAt: Date | null;
}

/**
 * Since when the interface has matched the tuple it matches today: its
 * creation, or the PATCH that last changed its externalId or operation,
 * whichever is later (wave 1a final review).
 *
 * WHY NOT `createdAt` ALONE. The cut-off was judged on when the interface was
 * created, and the interfaces PATCH can change the operation — or, for your
 * own API, the service path and so the externalId — of an interface created
 * long before the deploy. A builder moving an old CREATE interface to READ put
 * it onto a NO_MATCH READ grant's tuple, and legacy honoured that grant there,
 * on a product nobody approved it for: A47 by the side door, while adding a
 * new interface was refused. What matters is when the interface began to
 * match, and that is the later of the two.
 */
export function grantMatchSince(iface: Pick<GrantedInterface, "createdAt" | "grantMatchChangedAt">): Date {
  const changed = iface.grantMatchChangedAt;
  return changed != null && changed.getTime() > iface.createdAt.getTime() ? changed : iface.createdAt;
}

/** The grant fields `isUsableUnder` judges. Required, so a caller cannot forget to select them. */
export interface UsableGrantFields {
  interfaceId?: string | null;
  sapProduct?: string | null;
  createdAt: Date;
  unboundCutoffAt: Date | null;
}

/**
 * The `where` fragment for "grants that may authorise THIS interface" — the
 * caller adds the tenant, the solution and the environment.
 *
 * A bound grant matches only its own interface, with the service, operation
 * and product it was approved for. An UNBOUND grant is fetched on the old
 * tuple in either mode; `grantsUsableUnder` then decides whether it may
 * authorise, and when it may not, the refusal can say "needs re-approval"
 * instead of "no grant".
 */
export function grantsForInterfaceWhere(iface: GrantedInterface): Prisma.ApiAccessGrantWhereInput {
  return {
    externalId: iface.externalId,
    operation: iface.operation,
    OR: [{ interfaceId: iface.id, sapProduct: iface.sapProduct }, { interfaceId: null }],
  };
}

/**
 * `grantsForInterfaceWhere` as a predicate, for a caller that fetched the
 * solution's grants once and judges several interfaces against them
 * (discovery, P0.4). Kept beside the `where` it mirrors, and pinned to it by
 * tests/unit/northbound/read-verdict.test.ts, so the two cannot drift.
 */
export function grantFetchedFor(
  grant: { externalId: string; operation: string; interfaceId?: string | null; sapProduct?: string | null },
  iface: GrantedInterface,
): boolean {
  return (
    grant.externalId === iface.externalId &&
    grant.operation === iface.operation &&
    (grant.interfaceId == null || (grant.interfaceId === iface.id && grant.sapProduct === iface.sapProduct))
  );
}

/**
 * Is this fetched grant bound to the interface? False for a legacy unbound
 * grant. A row read without `interfaceId` selected is treated as unbound,
 * never as bound: the safe reading under strict.
 */
export function isBoundTo(
  grant: { interfaceId?: string | null; sapProduct?: string | null },
  iface: Pick<GrantedInterface, "id" | "sapProduct">,
): boolean {
  return grant.interfaceId === iface.id && grant.sapProduct === iface.sapProduct;
}

/**
 * May this fetched grant authorise a call on the interface, under the mode?
 *
 * A bound grant: always (it was fetched for its own interface). An unbound
 * one: never under strict. Under legacy, only on an interface that matched
 * the grant's tuple by its cut-off (wave 1a integration review; since when it
 * matched, not when it was created: `grantMatchSince`): the P0.1 deploy, stamped
 * by its migration, or for a grant the old code created during the rollout,
 * that grant's own creation. Legacy exists so that no call that worked before
 * the deploy stops; an interface added since carried none, and honouring the
 * old tuple on it would extend the approval to it — on another SAP product,
 * say — which is A47 in the deployed default.
 */
export function isUsableUnder(
  grant: UsableGrantFields,
  iface: GrantedInterface,
  mode: GrantBindingMode = grantBindingMode(),
): boolean {
  if (isBoundTo(grant, iface)) return true;
  // Bound to another interface (or this one on another product): never.
  if (grant.interfaceId != null || mode === "strict") return false;
  const cutoff = grant.unboundCutoffAt ?? grant.createdAt;
  return grantMatchSince(iface).getTime() <= cutoff.getTime();
}

/** The subset of fetched grants the current mode lets authorise. */
export function grantsUsableUnder<G extends UsableGrantFields>(
  grants: readonly G[],
  iface: GrantedInterface,
  mode: GrantBindingMode = grantBindingMode(),
): G[] {
  return grants.filter((g) => isUsableUnder(g, iface, mode));
}

/** The hourly throttle on the "an unbound grant was used" stamp. */
export const UNBOUND_USE_STAMP_INTERVAL_MS = 60 * 60 * 1000;

/** Anything that can send one raw statement: the app client, a test's own. */
type GrantStampDb = { $executeRaw(query: Prisma.Sql): PromiseLike<number> };

/** A JS instant as a `timestamp(3)` column holds it: UTC wall time, whatever the session's zone. */
const utc = (at: Date) => Prisma.sql`(${at.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

/**
 * Record that unbound legacy grants authorised a call: the durable signal
 * that strict binding would refuse this traffic.
 *
 * NEVER FAILS THE CALL. The grant has already authorised it; a failed stamp
 * is logged and passed over. At most one write per grant per hour, and none
 * at all when every grant was stamped recently.
 *
 * ONE STATEMENT (P0.19 review round 1). Prisma sends `updateMany` as BEGIN,
 * UPDATE, COMMIT: three round trips on a pooled connection for one stamp.
 * This is the same UPDATE, with the same conditions, sent alone. The tenant
 * guard does not see a raw statement, so the organisation is in its WHERE
 * (pinned by tests/unit/studio/unbound-grant-stamp-sql.test.ts).
 */
export async function recordUnboundGrantUse(
  db: GrantStampDb,
  organizationId: string,
  grants: readonly { id?: string; unboundLastUsedAt?: Date | null }[],
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - UNBOUND_USE_STAMP_INTERVAL_MS);
  const due = grants
    .filter((g) => typeof g.id === "string")
    .filter((g) => g.unboundLastUsedAt == null || g.unboundLastUsedAt.getTime() < cutoff.getTime())
    .map((g) => g.id as string);
  if (due.length === 0) return;
  console.warn("[grant-binding] an unbound legacy grant authorised a call; strict binding would refuse it", {
    organizationId,
    grantIds: due,
  });
  try {
    await db.$executeRaw(Prisma.sql`
      UPDATE "ApiAccessGrant" SET "unboundLastUsedAt" = ${utc(now)}
      WHERE "organizationId" = ${organizationId}
        AND "id" IN (${Prisma.join(due)})
        AND "interfaceId" IS NULL
        AND ("unboundLastUsedAt" IS NULL OR "unboundLastUsedAt" < ${utc(cutoff)})`);
  } catch (err) {
    console.error("[grant-binding] failed to record an unbound grant's use", {
      organizationId,
      error: err instanceof Error ? err.name : "unknown",
    });
  }
}

/** Where a request is raised or decided: the interfaces it could name. */
type InterfaceLookupDb = {
  interface: { findMany: Prisma.TransactionClient["interface"]["findMany"] };
};

export type BindingOutcome =
  | { readonly ok: true; readonly interfaceId: string; readonly sapProduct: string }
  | { readonly ok: false; readonly reason: UnboundReason };

/**
 * The single interface a (solution, externalId, operation) names, if exactly
 * one does, so a request raised by an older caller (externalId, no
 * interfaceId) is bound to the interface it names. With `raisedAt`, for a
 * pending legacy request at its decision, only an interface that matched it
 * when the request was raised counts (review round 1): one added since — or
 * PATCHed onto its tuple since (`grantMatchSince`) — is not what was asked
 * for. Unlike the backfill's rule for a decided grant, which must not narrow
 * one that already carries traffic, a pending request carries none, so this
 * limit may pick the one interface it was raised from out of several (and the
 * backfill does the same for a pending row).
 */
export async function findBinding(
  db: InterfaceLookupDb,
  grant: { organizationId: string; solutionId: string; externalId: string; operation: string },
  raisedAt?: Date,
): Promise<BindingOutcome> {
  const candidates = await db.interface.findMany({
    where: {
      organizationId: grant.organizationId,
      solutionId: grant.solutionId,
      externalId: grant.externalId,
      operation: grant.operation,
      ...(raisedAt
        ? {
            createdAt: { lte: raisedAt },
            OR: [{ grantMatchChangedAt: null }, { grantMatchChangedAt: { lte: raisedAt } }],
          }
        : {}),
    },
    select: { id: true, sapProduct: true },
    take: 2,
  });
  if (candidates.length === 0) return { ok: false, reason: "NO_MATCH" };
  if (candidates.length > 1) return { ok: false, reason: "AMBIGUOUS" };
  const [only] = candidates as [{ id: string; sapProduct: string }];
  return { ok: true, interfaceId: only.id, sapProduct: only.sapProduct };
}

/**
 * The binding a DECISION writes, or why the decision may not be made.
 *
 * A bound request keeps its binding. An unbound one (raised by the old code
 * during the rollout) is bound here if exactly one interface matches that
 * existed when it was raised: a request is raised from an interface, so one
 * added since is not what was asked for. Otherwise only a REJECTION may settle
 * it: an approval of an unbound request would be exactly the grant A47
 * describes. Nor is a request the backfill flagged (`unboundReason`) bound by
 * a guess, whatever has changed since: it matched several interfaces, or
 * none, and only the requester knows which one they meant (review round 1).
 */
export async function bindingForDecision(
  db: InterfaceLookupDb,
  grant: {
    organizationId: string;
    solutionId: string;
    externalId: string;
    operation: string;
    interfaceId: string | null;
    sapProduct: string | null;
    unboundReason: string | null;
    createdAt: Date;
  },
  next: string,
): Promise<
  | { readonly ok: true; readonly binding: { interfaceId: string; sapProduct: string } | null }
  | { readonly ok: false; readonly message: string }
> {
  if (grant.interfaceId !== null && grant.sapProduct !== null) {
    return { ok: true, binding: { interfaceId: grant.interfaceId, sapProduct: grant.sapProduct } };
  }
  const found: BindingOutcome =
    grant.unboundReason !== null
      ? { ok: false, reason: grant.unboundReason === "AMBIGUOUS" ? "AMBIGUOUS" : "NO_MATCH" }
      : await findBinding(db, grant, grant.createdAt);
  if (found.ok) return { ok: true, binding: { interfaceId: found.interfaceId, sapProduct: found.sapProduct } };
  if (next === "REJECTED") return { ok: true, binding: null };
  return { ok: false, message: UNBOUND_DECISION_REFUSAL[found.reason] };
}

/** What an approver is told when an unbound request cannot be approved. */
export const UNBOUND_DECISION_REFUSAL: Readonly<Record<UnboundReason, string>> = {
  NO_MATCH:
    "This request names no interface of the app, so approving it would authorise nothing in particular — or whatever is added later. " +
    "Reject it, and ask for it to be raised again from the interface it is for.",
  AMBIGUOUS:
    "This request matches more than one of the app's interfaces (the same service on different SAP systems), so an approval would cover all of them. " +
    "Reject it, and ask for it to be raised again from the one interface it is for.",
};

/** The flag approvers see on an unbound grant. */
export const UNBOUND_GRANT_LABEL: Readonly<Record<UnboundReason | "UNCHECKED", string>> = {
  NO_MATCH: "Needs re-approval: matches none of the app's interfaces",
  AMBIGUOUS: "Needs re-approval: covers several interfaces on different SAP systems",
  UNCHECKED: "Needs re-approval: not bound to an interface",
};

/**
 * Does this grant need re-approval? Unbound, settled as granting, and still
 * authorising something: not pending (its decision binds it), not rejected or
 * revoked (flagging those invites a re-request of what a second person
 * refused), not lapsed. The one predicate every surface that flags it uses —
 * Control Tower, the CoreEdge requests board (`listGrantsNeedingReapproval`,
 * the same rule in SQL) and Studio's ledger.
 */
export function needsReapproval(
  grant: { interfaceId: string | null; decision: string; revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): boolean {
  return (
    grant.interfaceId === null &&
    grant.decision !== "REQUESTED" &&
    grant.decision !== "REJECTED" &&
    grant.revokedAt === null &&
    (grant.expiresAt === null || grant.expiresAt.getTime() > now.getTime())
  );
}

export function unboundGrantLabel(unboundReason: string | null): string {
  return unboundReason === "NO_MATCH" || unboundReason === "AMBIGUOUS"
    ? UNBOUND_GRANT_LABEL[unboundReason]
    : UNBOUND_GRANT_LABEL.UNCHECKED;
}

/**
 * THE BACKFILL, shared by the P0.1 migration and `pnpm grants:binding --apply`.
 *
 * Each unbound grant is bound to the one interface its old tuple matches —
 * same solution, organization, externalId and operation, which is exactly
 * what the broker matched on (the environment comes from the caller's token,
 * not the interface). Several matches: AMBIGUOUS; none, or only one added
 * after the grant: NO_MATCH; both stay unbound. Cannot fail on existing data: it writes only ids read from
 * Interface in the same statement. The migration holds a copy of this text;
 * tests/unit/northbound/grant-binding-broker.test.ts keeps the two identical.
 *
 * TWO LIMITS, so neither the deploy nor the operator's re-run can widen an
 * approval (review round 1), nor narrow one that carries traffic (round 2).
 * It used to re-check every unbound row, so a NO_MATCH approval bound itself
 * to whatever interface had been added since — on another SAP product — left
 * the re-approval lists, and strict then served it: A47 again.
 *
 *   - Only rows never classified (`unboundReason IS NULL`): a NO_MATCH or
 *     AMBIGUOUS grant waits for a person to re-approve it, whatever changes
 *     later. In the migration every row is unclassified, so this is a no-op
 *     there; afterwards it leaves only the rows the old code created during
 *     the rollout. So the statement is idempotent: a second run binds nothing.
 *   - A grant is bound only when exactly one interface matches it TODAY and
 *     that one matched it when the request was raised (`earlier`, judged on
 *     `grantMatchSince`): a request is raised from an interface, so one added
 *     later is not what anybody asked for, let alone approved. The time limit
 *     only ever withholds a binding: a grant that also matches an interface
 *     added since is AMBIGUOUS, not bound to the older one, because the old
 *     broker serves it on both and a binding would stop the newer one's calls
 *     on deploy, unflagged (review round 2). Unbound, legacy keeps every such
 *     call working.
 *   - EXCEPT A PENDING REQUEST (wave 1a final review). Round 2's reason is
 *     traffic, and a REQUESTED row carries none: the old broker serves only a
 *     granting decision. Marking it AMBIGUOUS because an interface was added
 *     after it was raised left it un-approvable (the decide route refuses a
 *     flagged request), though it was raised from the one interface that
 *     existed then. So a pending row is bound when exactly ONE interface
 *     matched it when it was raised, whatever was added since — the rule its
 *     decision applies (`findBinding` with `raisedAt`); several then is
 *     AMBIGUOUS, none NO_MATCH.
 */
export const GRANT_BINDING_BACKFILL_SQL = `WITH "candidates" AS (
  SELECT g."id" AS "grantId",
         COUNT(i."id") AS "matches",
         COUNT(i."id") FILTER (WHERE COALESCE(i."grantMatchChangedAt", i."createdAt") <= g."createdAt") AS "earlier",
         MIN(i."id") FILTER (WHERE COALESCE(i."grantMatchChangedAt", i."createdAt") <= g."createdAt") AS "interfaceId",
         MIN(i."sapProduct") FILTER (WHERE COALESCE(i."grantMatchChangedAt", i."createdAt") <= g."createdAt") AS "sapProduct"
  FROM "ApiAccessGrant" g
  LEFT JOIN "Interface" i
    ON i."solutionId" = g."solutionId"
   AND i."organizationId" = g."organizationId"
   AND i."externalId" = g."externalId"
   AND i."operation" = g."operation"
  WHERE g."interfaceId" IS NULL
    AND g."unboundReason" IS NULL
  GROUP BY g."id"
)
UPDATE "ApiAccessGrant" AS g
SET "interfaceId" = CASE WHEN c."earlier" = 1 AND (c."matches" = 1 OR g."decision" = 'REQUESTED') THEN c."interfaceId" ELSE NULL END,
    "sapProduct" = CASE WHEN c."earlier" = 1 AND (c."matches" = 1 OR g."decision" = 'REQUESTED') THEN c."sapProduct" ELSE NULL END,
    "unboundReason" = CASE
      WHEN c."earlier" = 1 AND (c."matches" = 1 OR g."decision" = 'REQUESTED') THEN NULL
      WHEN g."decision" = 'REQUESTED' AND c."earlier" > 1 THEN 'AMBIGUOUS'
      WHEN g."decision" = 'REQUESTED' THEN 'NO_MATCH'
      WHEN c."matches" > 1 THEN 'AMBIGUOUS'
      ELSE 'NO_MATCH'
    END
FROM "candidates" AS c
WHERE g."id" = c."grantId";`;

/**
 * THE LEGACY CUT-OFF, run by the P0.1 migration right after the backfill and
 * nowhere else (wave 1a integration review): every grant the deploy left
 * unbound is stamped with the deploy's time, the last moment the old tuple
 * matching carried traffic. Under legacy it is honoured only on interfaces
 * created by then (`isUsableUnder`).
 *
 * NOT IN THE OPERATOR'S RE-RUN. A grant the old code creates during the
 * rollout is classified by `pnpm grants:binding --apply`, possibly days later;
 * stamping it then would honour it on every interface added in between. It
 * stays unstamped, and its own createdAt stands in: it was raised from an
 * interface that existed by then. Idempotent: a stamped row is never moved.
 * The migration holds a copy of this text; the same test keeps them identical.
 *
 * IN UTC (wave 1a final review). The column is a `timestamp` without a time
 * zone, and every createdAt it is compared with is written by Prisma in UTC.
 * A bare CURRENT_TIMESTAMP is stored as the session's local wall-clock time,
 * so a migrating role with TimeZone=Asia/Kuala_Lumpur put the cut-off eight
 * hours after the deploy (honouring unbound grants on interfaces added in
 * those hours: A47), and a zone west of UTC put it before the deploy
 * (refusing calls that worked: the migration's "nothing stops on deploy").
 */
export const GRANT_BINDING_CUTOFF_SQL = `UPDATE "ApiAccessGrant" SET "unboundCutoffAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE "interfaceId" IS NULL AND "unboundCutoffAt" IS NULL;`;
