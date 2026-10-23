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
 * can call a lane live that this refuses. The governed pipeline's authorise
 * step (governed/pipeline.ts `authorise`) is this module.
 *
 * v1 serves READ only. A WRITE-mode interface is refused here rather than
 * quietly downgraded, because silently turning a write request into a read is a
 * worse surprise than a clear refusal.
 */

import { prisma } from "@/lib/db/prisma";
import { afterResponse } from "@/lib/governed/after-response";
import { loadInterfaceAccess, type AccessLoad, type StoredConnectionRow } from "@/lib/governed/call-loads";
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
  isBoundTo,
  recordUnboundGrantUse,
  type GrantBindingMode,
  type GrantedInterface,
} from "@/lib/studio/grant-binding";
import type { TenantScope } from "@/lib/studio/tenant-scope";
import { apiPolicySignOffMode, policySignOffMissing } from "@/lib/studio/api-policy";

// The names this module has always exported, now defined beside the decision.
export type { AccessibleInterface, AccessRefusal };

/**
 * The organisation's active connections for the interface's product, read in
 * the same statement as the interface (P0.19), for the pipeline's
 * bindConnection step. Present only when asked for.
 */
export interface PrefetchedConnections {
  readonly product: string;
  readonly rows: readonly StoredConnectionRow[];
}

export interface AccessLoadOptions {
  /** Also read the connections that may serve the call (the pipeline does). */
  readonly withConnections?: boolean;
}

export type AccessResult =
  | { ok: true; iface: AccessibleInterface; connections?: PrefetchedConnections }
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
  // The §1.2 sign-off (P1.2), judged by authorisesHere where it is enforced.
  apiPolicySignOff: true,
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
 *
 * After the response (P0.19 review round 1): the stamp decides nothing about
 * this call, so it does not hold the caller up. It still counts in the
 * database budget (src/lib/governed/db-budget.ts). Outside a request it runs
 * at once and is awaited, as before.
 */
async function noteLegacyAuthority(
  scope: TenantScope,
  live: readonly AuthorisingGrant[],
  iface: GrantedInterface,
  now: Date,
): Promise<void> {
  if (live.some((g) => isBoundTo(g, iface))) return;
  await afterResponse(() => recordUnboundGrantUse(prisma, scope.organizationId, live, now));
}

/**
 * One route's access check: the interface row and the grants bound to it on
 * its product or, legacy, unbound — then `authorisesHere`.
 *
 * ONE STATEMENT (P0.19). The interface, its grants (grantsForInterfaceWhere,
 * in SQL) and, when asked, the connections that may serve the call are read
 * together (governed/call-loads.ts `loadInterfaceAccess`), every table scoped
 * to the token's organization. The grants were a second query, asked only when
 * the row alone did not refuse; they now cost nothing extra, and are judged
 * only then.
 */
async function resolveAccess(
  scope: TenantScope,
  solutionId: string,
  interfaceId: string,
  environment: string,
  route: "read" | "write",
  now: Date,
  options: AccessLoadOptions,
): Promise<AccessResult> {
  // Scoped by construction: the id cannot escape the token's organization.
  const loaded = await loadInterfaceAccess(scope.organizationId, solutionId, interfaceId, environment, options);
  const iface = loaded.iface;
  if (!iface) {
    return { ok: false, reason: "INTERFACE_NOT_FOUND", message: "No such interface." };
  }

  // Asked first, so an interface the row alone refuses (a sibling's, the
  // wrong mode, a deprecated one) is refused on the row whatever its grants say.
  const refused = interfaceRefusal(iface, solutionId, route);
  if (refused) return refused;

  // Bound to THIS interface on its product, or (legacy) unbound: in the load's SQL.
  const grants: readonly AuthorisingGrant[] = loaded.grants;

  const decision = authorisesHere({ iface, solutionId, environment, route, grants, now });
  if (!decision.ok) return decision;
  await noteLegacyAuthority(scope, decision.authorising, iface, now);
  // Observed, not refused (P1.2): what enforce would refuse, said in the log
  // the operator reads before switching (docs/runbooks/coreedge-api-policy.md).
  if (apiPolicySignOffMode() === "observe" && policySignOffMissing(iface)) {
    console.warn("[api-policy] a call was served on a customer-built S/4 Public service with no §1.2 sign-off; COREEDGE_API_POLICY_SIGNOFF=enforce would refuse it", {
      organizationId: scope.organizationId,
      interfaceId: iface.id,
      policySignOffMissing: true,
    });
  }
  return { ok: true, iface: decision.iface, ...connectionsOf(loaded) };
}

/** The prefetched connections, on a result asked for them. */
function connectionsOf(loaded: AccessLoad): { connections?: PrefetchedConnections } {
  return loaded.connections === null || loaded.iface === null
    ? {}
    : { connections: { product: loaded.iface.sapProduct, rows: loaded.connections } };
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
  options: AccessLoadOptions = {},
): Promise<AccessResult> {
  return resolveAccess(scope, solutionId, interfaceId, environment, "write", now, options);
}

export async function resolveReadableInterface(
  scope: TenantScope,
  solutionId: string,
  interfaceId: string,
  environment: string,
  now: Date = new Date(),
  options: AccessLoadOptions = {},
): Promise<AccessResult> {
  return resolveAccess(scope, solutionId, interfaceId, environment, "read", now, options);
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
