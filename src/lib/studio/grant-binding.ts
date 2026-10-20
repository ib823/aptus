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
 *     tuple matching, and each call it authorises stamps `unboundLastUsedAt`
 *     (at most hourly per grant), so the operator can see what strict would
 *     refuse.
 *   COREEDGE_GRANT_BINDING=strict — an unbound grant authorises nothing; the
 *     broker answers GRANT_NEEDS_REAPPROVAL.
 *
 * `pnpm grants:binding` counts the unbound grants (and with --apply binds any
 * that have since become unambiguous), so strict is switched on once the count
 * of live, used ones is zero. The runbook is docs/runbooks/coreedge-grant-binding.md.
 */

import type { Prisma } from "@prisma/client";

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
}

/**
 * The `where` fragment for "grants that may authorise THIS interface" — the
 * caller adds the tenant, the solution and the environment.
 *
 * A bound grant matches only its own interface, with the service, operation
 * and product it was approved for. Under legacy, an UNBOUND grant also
 * matches on the old tuple; under strict it is fetched too, but only so the
 * refusal can say "needs re-approval" instead of "no grant" (see
 * `isBoundTo`).
 */
export function grantsForInterfaceWhere(iface: GrantedInterface): Prisma.ApiAccessGrantWhereInput {
  return {
    externalId: iface.externalId,
    operation: iface.operation,
    OR: [{ interfaceId: iface.id, sapProduct: iface.sapProduct }, { interfaceId: null }],
  };
}

/**
 * Is this fetched grant bound to the interface? False for a legacy unbound
 * grant. A row read without `interfaceId` selected is treated as unbound,
 * never as bound: the safe reading under strict.
 */
export function isBoundTo(
  grant: { interfaceId?: string | null; sapProduct?: string | null },
  iface: GrantedInterface,
): boolean {
  return grant.interfaceId === iface.id && grant.sapProduct === iface.sapProduct;
}

/** The subset of fetched grants the current mode lets authorise. */
export function grantsUsableUnder<G extends { interfaceId?: string | null; sapProduct?: string | null }>(
  grants: readonly G[],
  iface: GrantedInterface,
  mode: GrantBindingMode = grantBindingMode(),
): G[] {
  return mode === "strict" ? grants.filter((g) => isBoundTo(g, iface)) : [...grants];
}

/** The hourly throttle on the "an unbound grant was used" stamp. */
export const UNBOUND_USE_STAMP_INTERVAL_MS = 60 * 60 * 1000;

type GrantStampDb = { apiAccessGrant: { updateMany: Prisma.TransactionClient["apiAccessGrant"]["updateMany"] } };

/**
 * Record that unbound legacy grants authorised a call: the durable signal
 * that strict binding would refuse this traffic.
 *
 * NEVER FAILS THE CALL. The grant has already authorised it; a failed stamp
 * is logged and passed over. At most one write per grant per hour, and none
 * at all when every grant was stamped recently.
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
    await db.apiAccessGrant.updateMany({
      where: {
        organizationId,
        id: { in: due },
        interfaceId: null,
        OR: [{ unboundLastUsedAt: null }, { unboundLastUsedAt: { lt: cutoff } }],
      },
      data: { unboundLastUsedAt: now },
    });
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
 * one does. The same rule the migration's backfill applies, so a request
 * raised by an older caller (externalId, no interfaceId) and a pending
 * legacy request are bound exactly as the backfill would have bound them.
 */
export async function findBinding(
  db: InterfaceLookupDb,
  grant: { organizationId: string; solutionId: string; externalId: string; operation: string },
): Promise<BindingOutcome> {
  const candidates = await db.interface.findMany({
    where: {
      organizationId: grant.organizationId,
      solutionId: grant.solutionId,
      externalId: grant.externalId,
      operation: grant.operation,
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
 * A bound request keeps its binding. An unbound one (raised before P0.1, or by
 * a caller that named no interface while two matched) is bound here if
 * exactly one interface matches. Otherwise only a REJECTION may settle it: an
 * approval of an unbound request would be exactly the grant A47 describes.
 */
export async function bindingForDecision(
  db: InterfaceLookupDb,
  grant: {
    organizationId: string;
    solutionId: string;
    externalId: string;
    operation: string;
    interfaceId?: string | null;
    sapProduct?: string | null;
  },
  next: string,
): Promise<
  | { readonly ok: true; readonly binding: { interfaceId: string; sapProduct: string } | null }
  | { readonly ok: false; readonly message: string }
> {
  // `!= null`: a row read without the binding selected is unbound, never bound.
  if (grant.interfaceId != null && grant.sapProduct != null) {
    return { ok: true, binding: { interfaceId: grant.interfaceId, sapProduct: grant.sapProduct } };
  }
  const found = await findBinding(db, grant);
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
 * not the interface). Zero matches: NO_MATCH; several: AMBIGUOUS; both stay
 * unbound. Idempotent (it touches only unbound rows, and recomputes their
 * reason) and cannot fail on existing data: it writes only ids read from
 * Interface in the same statement. The migration holds a copy of this text;
 * tests/unit/studio/grant-binding.test.ts keeps the two identical.
 */
export const GRANT_BINDING_BACKFILL_SQL = `WITH "candidates" AS (
  SELECT g."id" AS "grantId",
         COUNT(i."id") AS "matches",
         MIN(i."id") AS "interfaceId",
         MIN(i."sapProduct") AS "sapProduct"
  FROM "ApiAccessGrant" g
  LEFT JOIN "Interface" i
    ON i."solutionId" = g."solutionId"
   AND i."organizationId" = g."organizationId"
   AND i."externalId" = g."externalId"
   AND i."operation" = g."operation"
  WHERE g."interfaceId" IS NULL
  GROUP BY g."id"
)
UPDATE "ApiAccessGrant" AS g
SET "interfaceId" = CASE WHEN c."matches" = 1 THEN c."interfaceId" ELSE NULL END,
    "sapProduct" = CASE WHEN c."matches" = 1 THEN c."sapProduct" ELSE NULL END,
    "unboundReason" = CASE
      WHEN c."matches" = 0 THEN 'NO_MATCH'
      WHEN c."matches" > 1 THEN 'AMBIGUOUS'
      ELSE NULL
    END
FROM "candidates" AS c
WHERE g."id" = c."grantId";`;
