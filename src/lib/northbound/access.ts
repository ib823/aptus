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
 * v1 serves READ only. A WRITE-mode interface is refused here rather than
 * quietly downgraded, because silently turning a write request into a read is a
 * worse surprise than a clear refusal.
 */

import { prisma } from "@/lib/db/prisma";
import { afterResponse } from "@/lib/governed/after-response";
import { loadInterfaceAccess, type AccessLoad, type StoredConnectionRow } from "@/lib/governed/call-loads";
import {
  grantBindingMode,
  grantsUsableUnder,
  isBoundTo,
  isUsableUnder,
  recordUnboundGrantUse,
  type GrantBindingMode,
  type GrantedInterface,
} from "@/lib/studio/grant-binding";
import {
  grantsRead,
  grantsWrite,
  type GrantDecision,
  type GrantEnvironment,
} from "@/lib/studio/grants";
import type { TenantScope } from "@/lib/studio/tenant-scope";

export interface AccessibleInterface {
  id: string;
  name: string;
  externalId: string;
  sapProduct: string;
  entitySet: string | null;
  operation: string;
  mode: string;
  version: number;
  /**
   * TRUE when the interface is still DRAFT. Reads from a draft are served —
   * "reads from one are merely premature" — but the caller is TOLD, via an
   * x-coreedge-interface-status header, instead of the status being silently
   * ignored. DEPRECATED refuses outright (see INTERFACE_DEPRECATED): an
   * interface kept for the record must not quietly keep serving new traffic.
   */
  draft: boolean;
  /**
   * The interface's OWN service root, or null for a catalogue interface — see
   * resolveInterfaceService. Mapped with `?? null` so a row read without these
   * fields reads as catalogue, never as custom.
   */
  servicePath: string | null;
  odataVersion: string | null;
  /** Last successful live $metadata verification, in any environment (display and activation). */
  serviceVerifiedAt: Date | null;
  /**
   * Successful verifications PER ENVIRONMENT (service-verifications.ts). The
   * write route gates a custom service on the caller's environment's entry,
   * for the binding the write uses — never on serviceVerifiedAt.
   */
  serviceVerifications: unknown;
}

export type AccessRefusal =
  | "INTERFACE_NOT_FOUND"
  | "NOT_THIS_SOLUTION"
  | "NO_APPROVED_GRANT"
  | "GRANT_EXPIRED"
  /** Withdrawn by a human, as distinct from lapsed by the clock. */
  | "GRANT_REVOKED"
  | "WRITE_NOT_SERVED"
  | "READ_ONLY_INTERFACE"
  | "INTERFACE_NOT_ACTIVE"
  /**
   * A write interface whose operation the executor cannot perform. Today that
   * is UPDATE: `writeEntitySet` only POSTs to the entity set, which in OData is
   * a CREATE. Serving an UPDATE interface through it would add a new record to
   * the client's system and report it as success.
   */
  | "OPERATION_NOT_SUPPORTED"
  /**
   * A read against a DEPRECATED interface. The read path never selected
   * `status`, so a deprecated — or draft — interface served live customer
   * data exactly like an ACTIVE one, while the write path checked. The
   * asymmetry stays deliberate for DRAFT (premature ≠ wrong) and ends for
   * DEPRECATED: deprecation is a statement that new traffic should stop.
   */
  | "INTERFACE_DEPRECATED"
  /**
   * The only grant that would authorise this call is a legacy grant bound to
   * no interface, and COREEDGE_GRANT_BINDING is strict (P0.1, A47). It needs
   * re-approval against the interface it is for.
   */
  | "GRANT_NEEDS_REAPPROVAL";

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

interface FetchedGrant {
  id?: string;
  decision: string;
  expiresAt: Date | null;
  operation?: string;
  revokedAt?: Date | null;
  interfaceId?: string | null;
  sapProduct?: string | null;
  unboundLastUsedAt?: Date | null;
  createdAt: Date;
  unboundCutoffAt: Date | null;
}

/**
 * Would an unbound grant the mode set aside have authorised this call? Under
 * strict, any unbound grant; under legacy, one whose cut-off predates this
 * interface. Then the refusal names re-approval rather than a missing grant —
 * the remedy is different, and so is who acts.
 */
function setAsideAGrant(
  grants: readonly FetchedGrant[],
  iface: GrantedInterface,
  mode: GrantBindingMode,
  authorises: (g: FetchedGrant) => boolean,
  now: Date,
): boolean {
  return grants.some(
    (g) =>
      !isUsableUnder(g, iface, mode) &&
      authorises(g) &&
      g.revokedAt == null &&
      (g.expiresAt === null || g.expiresAt.getTime() > now.getTime()),
  );
}

const NEEDS_REAPPROVAL_MESSAGE =
  "The access grant for this capability was approved before grants were bound to one interface, and this deployment does not honour such grants on this interface. Ask for it to be approved again against this interface.";

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
  live: readonly FetchedGrant[],
  iface: GrantedInterface,
  now: Date,
): Promise<void> {
  if (live.some((g) => isBoundTo(g, iface))) return;
  await afterResponse(() => recordUnboundGrantUse(prisma, scope.organizationId, live, now));
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
  // The interface, its grants and (when asked) its connections: one statement (P0.19).
  const loaded = await loadInterfaceAccess(scope.organizationId, solutionId, interfaceId, environment, options);
  const iface = loaded.iface;

  if (!iface) {
    return { ok: false, reason: "INTERFACE_NOT_FOUND", message: "No such interface." };
  }
  if (iface.solutionId !== solutionId) {
    // Same message as absent — a client must not discover its neighbours.
    return { ok: false, reason: "NOT_THIS_SOLUTION", message: "No such interface." };
  }
  if (iface.mode !== "WRITE") {
    return {
      ok: false,
      reason: "READ_ONLY_INTERFACE",
      message: "This interface is configured for reads. Writing through it is not permitted.",
    };
  }
  if (iface.status !== "ACTIVE") {
    // A DRAFT interface has not been through review. Reads from one are merely
    // premature; writes from one are changes to a client's system authorised by
    // nobody.
    return {
      ok: false,
      reason: "INTERFACE_NOT_ACTIVE",
      message: `This interface is ${iface.status}. Only an ACTIVE interface may write.`,
    };
  }
  /*
   * CREATE IS THE ONLY WRITE THE EXECUTOR PERFORMS. An UPDATE passed every gate
   * above and below — mode WRITE, status ACTIVE, and the grant filter accepts
   * CREATE and UPDATE alike — and then `writeEntitySet` POSTed it to the entity
   * set. The application asked to change a record; SAP created a new one; the
   * broker answered 201. Refused here, before the grant query and before an
   * idempotency key is reserved, so nothing reaches SAP and the refusal says why.
   */
  if (iface.operation !== "CREATE") {
    return {
      ok: false,
      reason: "OPERATION_NOT_SUPPORTED",
      message:
        `This interface is configured to ${iface.operation} records, and CoreEdge can only create them today. ` +
        "It refuses rather than sending the change as a create, which would add a new record instead of changing the one you meant.",
    };
  }

  // Bound to THIS interface on its product, or (legacy) unbound — see check 5:
  // grantsForInterfaceWhere, in the load's SQL.
  const grants: readonly FetchedGrant[] = loaded.grants;

  const bindingMode = grantBindingMode();
  // A READ grant never authorises a write.
  const authorisesWrite = (g: FetchedGrant) =>
    (g.operation === "CREATE" || g.operation === "UPDATE") &&
    grantsWrite(g.decision as GrantDecision, environment as GrantEnvironment);
  const granting = grantsUsableUnder(grants, iface, bindingMode).filter(authorisesWrite);
  if (granting.length === 0) {
    if (setAsideAGrant(grants, iface, bindingMode, authorisesWrite, now)) {
      return { ok: false, reason: "GRANT_NEEDS_REAPPROVAL", message: NEEDS_REAPPROVAL_MESSAGE };
    }
    return {
      ok: false,
      reason: "NO_APPROVED_GRANT",
      message: `No approved WRITE grant for this capability in ${environment}.`,
    };
  }

  /*
   * REVOKED BEFORE EXPIRED. A withdrawal is immediate and deliberate; checking
   * it first means the refusal says what actually happened rather than blaming
   * the clock. A revoked grant with a future expiry would otherwise pass here.
   */
  // `== null` matches null and undefined alike. Prisma returns null for an
  // unset column, and a row read without this field selected must not be
  // mistaken for a revoked one — that would refuse traffic that was never
  // withdrawn, which is a louder failure than it looks.
  const unrevoked = granting.filter((g) => g.revokedAt == null);
  if (unrevoked.length === 0) {
    return {
      ok: false,
      reason: "GRANT_REVOKED",
      message: `The WRITE grant for this capability in ${environment} has been revoked.`,
    };
  }

  const live = unrevoked.filter((g) => g.expiresAt === null || g.expiresAt.getTime() > now.getTime());
  if (live.length === 0) {
    return {
      ok: false,
      reason: "GRANT_EXPIRED",
      message: `The WRITE grant for this capability in ${environment} has expired.`,
    };
  }
  await noteLegacyAuthority(scope, live, iface, now);

  return {
    ok: true,
    iface: {
      id: iface.id,
      name: iface.name,
      externalId: iface.externalId,
      sapProduct: iface.sapProduct,
      entitySet: iface.entitySet,
      operation: iface.operation,
      mode: iface.mode,
      version: iface.version,
      // The write path only reaches here for ACTIVE interfaces.
      draft: false,
      servicePath: iface.servicePath ?? null,
      odataVersion: iface.odataVersion ?? null,
      serviceVerifiedAt: iface.serviceVerifiedAt ?? null,
      serviceVerifications: iface.serviceVerifications ?? null,
    },
    ...connectionsOf(loaded),
  };
}

export async function resolveReadableInterface(
  scope: TenantScope,
  solutionId: string,
  interfaceId: string,
  environment: string,
  now: Date = new Date(),
  options: AccessLoadOptions = {},
): Promise<AccessResult> {
  // Scoped by construction: the id cannot escape the token's organization.
  // The interface, its grants and (when asked) its connections: one statement
  // (P0.19). The grants were a second query, asked only when the row alone did
  // not refuse; they now cost nothing extra, and are judged only then.
  const loaded = await loadInterfaceAccess(scope.organizationId, solutionId, interfaceId, environment, options);
  const iface = loaded.iface;

  if (!iface) {
    return {
      ok: false,
      reason: "INTERFACE_NOT_FOUND",
      message: "No such interface.",
    };
  }

  const refused = interfaceReadRefusal(iface, solutionId);
  if (refused) return refused;

  // scopedWhere's organization, the credential's solution and environment,
  // and grantsForInterfaceWhere: in the load's SQL.
  const grants: readonly FetchedGrant[] = loaded.grants;

  const decision = decideReadAccess(iface, solutionId, environment, grants, now);
  if (!decision.ok) return decision;
  await noteLegacyAuthority(scope, decision.authorising, iface, now);
  return { ok: true, iface: decision.iface, ...connectionsOf(loaded) };
}

/** The prefetched connections, on a result asked for them. */
function connectionsOf(loaded: AccessLoad): { connections?: PrefetchedConnections } {
  return loaded.connections === null || loaded.iface === null
    ? {}
    : { connections: { product: loaded.iface.sapProduct, rows: loaded.connections } };
}

/** The interface fields the read decision judges. */
export interface ReadableInterfaceRow extends GrantedInterface {
  name: string;
  entitySet: string | null;
  mode: string;
  version: number;
  status: string;
  solutionId: string;
  servicePath?: string | null;
  odataVersion?: string | null;
  serviceVerifiedAt?: Date | null;
  serviceVerifications?: unknown;
}

/** What the read decision selects of an interface; discovery selects the same. */
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

/** The grant fields the read decision judges; GRANT_SELECT selects them. */
export type ReadDecisionGrant = FetchedGrant;

/** A read decision, with the grants that authorised it when it was granted. */
export type ReadDecision =
  | { ok: true; iface: AccessibleInterface; authorising: readonly FetchedGrant[] }
  | { ok: false; reason: AccessRefusal; message: string };

/**
 * THE READ DECISION, WITHOUT I/O (P0.4, A42). Given the interface row and the
 * grants fetched for it (`grantsForInterfaceWhere`, or `grantFetchedFor` over a
 * batch), may this solution's credential in `environment` read it?
 *
 * One function so the data route, the Test Console's dry run and discovery's
 * `callable` cannot disagree: discovery fetches the solution's grants once and
 * asks this per interface, where it used to keep its own copy of the rules —
 * which is how it came to advertise refused feeds as callable.
 */
export function decideReadAccess(
  iface: ReadableInterfaceRow,
  solutionId: string,
  environment: string,
  grants: readonly FetchedGrant[],
  now: Date,
  bindingMode: GrantBindingMode = grantBindingMode(),
): ReadDecision {
  const refused = interfaceReadRefusal(iface, solutionId);
  if (refused) return refused;

  const authorisesRead = (g: FetchedGrant) =>
    grantsRead(g.decision as GrantDecision, environment as GrantEnvironment);
  return decideOnGrants(iface, environment, grants, now, bindingMode, authorisesRead);
}

/**
 * The refusals the interface row decides alone, before any grant is looked at
 * — so the read path never spends a grant query on them. Mode is the harder
 * gate: a write interface is refused here whatever its grants say.
 */
function interfaceReadRefusal(
  iface: ReadableInterfaceRow,
  solutionId: string,
): Extract<ReadDecision, { ok: false }> | null {
  if (iface.solutionId !== solutionId) {
    // Same message as "not found" on purpose — a client must not be able to
    // discover which interfaces exist outside its own solution.
    return {
      ok: false,
      reason: "NOT_THIS_SOLUTION",
      message: "No such interface.",
    };
  }

  if (iface.mode === "WRITE") {
    return {
      ok: false,
      reason: "WRITE_NOT_SERVED",
      message: "This interface is configured for writes, which this API does not serve.",
    };
  }

  // See INTERFACE_DEPRECATED on the refusal union. DRAFT continues below and
  // is flagged on the result instead of refused.
  if (iface.status === "DEPRECATED") {
    return {
      ok: false,
      reason: "INTERFACE_DEPRECATED",
      message: "This interface has been deprecated. Ask the solution's builder for its replacement.",
    };
  }
  return null;
}

/** The grant half of the read decision. */
function decideOnGrants(
  iface: ReadableInterfaceRow,
  environment: string,
  grants: readonly FetchedGrant[],
  now: Date,
  bindingMode: GrantBindingMode,
  authorisesRead: (g: FetchedGrant) => boolean,
): ReadDecision {
  const granting = grantsUsableUnder(grants, iface, bindingMode).filter(authorisesRead);
  if (granting.length === 0) {
    if (setAsideAGrant(grants, iface, bindingMode, authorisesRead, now)) {
      return { ok: false, reason: "GRANT_NEEDS_REAPPROVAL", message: NEEDS_REAPPROVAL_MESSAGE };
    }
    return {
      ok: false,
      reason: "NO_APPROVED_GRANT",
      message: `No approved access grant for this capability in ${environment}.`,
    };
  }

  // Revoked before expired — see the WRITE path above. A withdrawal is a
  // deliberate act and the refusal should name it.
  // `== null` matches null and undefined alike. Prisma returns null for an
  // unset column, and a row read without this field selected must not be
  // mistaken for a revoked one — that would refuse traffic that was never
  // withdrawn, which is a louder failure than it looks.
  const unrevoked = granting.filter((g) => g.revokedAt == null);
  if (unrevoked.length === 0) {
    return {
      ok: false,
      reason: "GRANT_REVOKED",
      message: `The access grant for this capability in ${environment} has been revoked.`,
    };
  }

  // Evaluated at call time: an expired grant must stop working the moment it
  // expires, not whenever a background job next runs.
  const live = unrevoked.filter((g) => g.expiresAt === null || g.expiresAt.getTime() > now.getTime());
  if (live.length === 0) {
    return {
      ok: false,
      reason: "GRANT_EXPIRED",
      message: `The access grant for this capability in ${environment} has expired.`,
    };
  }

  return {
    ok: true,
    authorising: live,
    iface: {
      id: iface.id,
      name: iface.name,
      externalId: iface.externalId,
      sapProduct: iface.sapProduct,
      entitySet: iface.entitySet,
      operation: iface.operation,
      mode: iface.mode,
      version: iface.version,
      draft: iface.status === "DRAFT",
      servicePath: iface.servicePath ?? null,
      odataVersion: iface.odataVersion ?? null,
      serviceVerifiedAt: iface.serviceVerifiedAt ?? null,
      serviceVerifications: iface.serviceVerifications ?? null,
    },
  };
}
