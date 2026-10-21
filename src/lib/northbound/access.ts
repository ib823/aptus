/**
 * Northbound access control — may THIS client read THIS interface, right now?
 *
 * The chain, and why each link exists:
 *
 *   1. The interface must belong to the token's own SOLUTION. A token is issued
 *      per solution, so an interface belonging to a sibling solution — even in
 *      the same organization — is not this client's to read.
 *   2. It must be organization-scoped. Belt to the braces above, and the layer
 *      that makes a stolen id from another tenant useless.
 *   3. An ApiAccessGrant must be APPROVED for this capability, at this
 *      operation, in this client's ENVIRONMENT. A grant approved for SANDBOX
 *      does not authorise the PROD client, which is the entire point of
 *      recording the environment.
 *   4. The grant must not have expired. Expiry is evaluated at CALL time, not
 *      by a sweep job — otherwise an expired grant keeps working until some
 *      background task happens to run, which makes the expiry date decorative.
 *   5. The grant must be BOUND to this interface, on this interface's SAP
 *      product (P0.1, A47). One approval used to authorise every interface of
 *      the solution that shared its service id and operation, including one
 *      added later on another SAP system. A legacy grant the P0.1 backfill
 *      could not bind keeps the old matching until COREEDGE_GRANT_BINDING is
 *      strict; see lib/studio/grant-binding.ts.
 *
 * THE DECISION ITSELF IS authorisation.ts `authorisesHere` (P0.2). This module
 * is its I/O: it reads the interface row and the grants fetched for it, scoped
 * to the token's organization, and hands them over. The lane board, the lane
 * sweep and discovery hand the same rows to the same function, so none of them
 * can call a lane live that this refuses.
 *
 * v1 serves READ only. A WRITE-mode interface is refused here rather than
 * quietly downgraded, because silently turning a write request into a read is a
 * worse surprise than a clear refusal.
 */

import { prisma } from "@/lib/db/prisma";
import {
  authorisesHere,
  interfaceRefusal,
  type AccessDecision,
  type AccessibleInterface,
  type AccessRefusal,
  type AuthorisableInterface,
  type AuthorisingGrant,
} from "@/lib/northbound/authorisation";
import {
  grantBindingMode,
  grantsForInterfaceWhere,
  isBoundTo,
  recordUnboundGrantUse,
  type GrantBindingMode,
  type GrantedInterface,
} from "@/lib/studio/grant-binding";
import { scopedById, scopedWhere, type TenantScope } from "@/lib/studio/tenant-scope";

// The names this module has always exported, now defined beside the decision.
export type { AccessibleInterface, AccessRefusal };

export type AccessResult =
  | { ok: true; iface: AccessibleInterface }
  | { ok: false; reason: AccessRefusal; message: string };

/** What the grant lookup selects: the decision, its end, and its binding. */
export const GRANT_SELECT = {
  id: true,
  decision: true,
  expiresAt: true,
  operation: true,
  revokedAt: true,
  interfaceId: true,
  sapProduct: true,
  unboundLastUsedAt: true,
  // An unbound grant's legacy cut-off, and its stand-in (grant-binding.ts).
  createdAt: true,
  unboundCutoffAt: true,
} as const;

/** What both decisions select of an interface; discovery and the lane board select the same. */
export const READABLE_INTERFACE_SELECT = {
  id: true,
  name: true,
  externalId: true,
  sapProduct: true,
  entitySet: true,
  operation: true,
  mode: true,
  version: true,
  status: true,
  solutionId: true,
  servicePath: true,
  odataVersion: true,
  serviceVerifiedAt: true,
  serviceVerifications: true,
  // Judged against an unbound grant's legacy cut-off (grant-binding.ts).
  createdAt: true,
  grantMatchChangedAt: true,
} as const;

/** The interface fields the read decision judges. */
export type ReadableInterfaceRow = AuthorisableInterface;

/** The grant fields the read decision judges; GRANT_SELECT selects them. */
export type ReadDecisionGrant = AuthorisingGrant;

/** A read decision, with the grants that authorised it when it was granted. */
export type ReadDecision = AccessDecision;

/**
 * After a call is authorised: if no BOUND grant was among the live ones, the
 * call rode on legacy matching alone, and that is recorded (at most hourly per
 * grant) as the signal strict binding would refuse it.
 */
async function noteLegacyAuthority(
  scope: TenantScope,
  live: readonly AuthorisingGrant[],
  iface: GrantedInterface,
  now: Date,
): Promise<void> {
  if (live.some((g) => isBoundTo(g, iface))) return;
  await recordUnboundGrantUse(prisma, scope.organizationId, live, now);
}

/**
 * One route's access check: the interface row, then (unless the row alone
 * refuses) the grants bound to it on its product or, legacy, unbound — then
 * `authorisesHere`.
 */
async function resolveAccess(
  scope: TenantScope,
  solutionId: string,
  interfaceId: string,
  environment: string,
  route: "read" | "write",
  now: Date,
): Promise<AccessResult> {
  // Scoped by construction: the id cannot escape the token's organization.
  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, interfaceId),
    select: READABLE_INTERFACE_SELECT,
  });
  if (!iface) {
    return { ok: false, reason: "INTERFACE_NOT_FOUND", message: "No such interface." };
  }

  // Asked first so an interface the row alone refuses (a sibling's, the wrong
  // mode, a deprecated one) never costs a grant query.
  const refused = interfaceRefusal(iface, solutionId, route);
  if (refused) return refused;

  const grants: AuthorisingGrant[] = await prisma.apiAccessGrant.findMany({
    // scopedWhere injects the organization; the rest narrows within it, to
    // grants bound to THIS interface on its product or (legacy) unbound.
    where: scopedWhere(scope, { solutionId, environment, ...grantsForInterfaceWhere(iface) }),
    select: GRANT_SELECT,
  });

  const decision = authorisesHere({ iface, solutionId, environment, route, grants, now });
  if (!decision.ok) return decision;
  await noteLegacyAuthority(scope, decision.authorising, iface, now);
  return { ok: true, iface: decision.iface };
}

/**
 * May this client WRITE through this interface, right now?
 *
 * The same chain as a read, with the mode inverted and one addition: the grant
 * must be for a write operation. A READ grant does not authorise a write, even
 * for the same service in the same environment — that distinction is the entire
 * reason `operation` is recorded on a grant.
 *
 * HUMAN OVERSIGHT SITS AT GRANT APPROVAL. There is no per-call confirmation by
 * design (a machine cannot meaningfully type one), so the approval of the WRITE
 * grant — which requires a second person and the write checklist — is the single
 * human checkpoint for every write this solution ever makes. That makes grant
 * expiry load-bearing, and it is evaluated here at CALL time: "approved once"
 * must not become "approved forever".
 */
export async function resolveWritableInterface(
  scope: TenantScope,
  solutionId: string,
  interfaceId: string,
  environment: string,
  now: Date = new Date(),
): Promise<AccessResult> {
  return resolveAccess(scope, solutionId, interfaceId, environment, "write", now);
}

export async function resolveReadableInterface(
  scope: TenantScope,
  solutionId: string,
  interfaceId: string,
  environment: string,
  now: Date = new Date(),
): Promise<AccessResult> {
  return resolveAccess(scope, solutionId, interfaceId, environment, "read", now);
}

/**
 * THE READ DECISION, WITHOUT I/O (P0.4, A42). Given the interface row and the
 * grants fetched for it (`grantsForInterfaceWhere`, or `grantFetchedFor` over a
 * batch), may this solution's credential in `environment` read it?
 *
 * `authorisesHere` on the read route, kept under its P0.4 name for the callers
 * that ask it.
 */
export function decideReadAccess(
  iface: ReadableInterfaceRow,
  solutionId: string,
  environment: string,
  grants: readonly ReadDecisionGrant[],
  now: Date,
  bindingMode: GrantBindingMode = grantBindingMode(),
): ReadDecision {
  return authorisesHere({ iface, solutionId, environment, route: "read", grants, now, bindingMode });
}
