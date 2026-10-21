/**
 * ONE AUTHORISATION PREDICATE for the broker and everything that previews it
 * (P0.2, audit A14-A19).
 *
 * THE DEFECT. The lane board could say "Live · Every hop proved" while the
 * broker refused every call on the lane. The board kept its own copy of the
 * rules and the copy had drifted: it ignored SANDBOX_ONLY, READ_ONLY and
 * DEPRECATED, it counted connections by environment where the broker binds on
 * product and SAP client, and it never heard of wave 1a's grant binding. Each
 * copy is one edit away from disagreeing again, so there is now one answer.
 *
 * WHAT IS HERE, and who asks it:
 *
 *   - `authorisesHere`: may this solution's credential in this environment
 *     call this interface, by the interface row and the grants fetched for it?
 *     The read route, the write route (through access.ts), discovery's
 *     `callable`, the lane board and the lane sweep.
 *   - `bindingFor`: which ONE connection would the call go through, or why
 *     none? The same callers, from the organisation's connections for the
 *     interface's product (`BindingEstate`).
 *   - `customServiceUnverified`: the write route's per-binding verification
 *     gate, so the board can say a write lane is refused before anyone calls.
 *   - `solutionRefusal`: the app-level gate authentication applies.
 *
 * The key's own state is key-policy.ts `keyRefusal`, which authentication and
 * the board both call.
 *
 * PURE. No database, no network, no secret: a browser component imports the
 * lane derivation, which imports this. The I/O lives in access.ts and
 * binding.ts, and both hand their rows to these functions.
 */

import { selectConnectionForEnvironment } from "@/lib/sap-public/connection-selection";
import type { BindableConnection, ConnectionBindingFailure } from "@/lib/sap-public/connection-selection";
import { isVerifiedForBinding } from "@/lib/sap-public/service-verifications";
import {
  grantBindingMode,
  grantsUsableUnder,
  isUsableUnder,
  type GrantBindingMode,
  type GrantedInterface,
} from "@/lib/studio/grant-binding";
import { grantsRead, grantsWrite, type GrantDecision, type GrantEnvironment } from "@/lib/studio/grants";

/* ── the route a lane's calls take ─────────────────────────────────────── */

/**
 * Which northbound route serves an interface: the write route for a
 * WRITE-mode interface, the read route otherwise. A lane is a preview of THAT
 * route — a read call on a write interface is refused (WRITE_NOT_SERVED) and
 * a write call on a read interface too (READ_ONLY_INTERFACE), and neither is
 * a call the app was ever meant to make.
 */
export type BrokerRoute = "read" | "write";

export function routeOf(iface: { readonly mode: string }): BrokerRoute {
  return iface.mode === "WRITE" ? "write" : "read";
}

/* ── the interface and its grants ──────────────────────────────────────── */

/** What a call is served as once it is authorised. */
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

/** The interface fields the decision judges. */
export interface AuthorisableInterface extends GrantedInterface {
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

/** The grant fields the decision judges; access.ts GRANT_SELECT selects them. */
export interface AuthorisingGrant {
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

export type AccessRefused = { ok: false; reason: AccessRefusal; message: string };

/** The decision, with the grants that authorised it when it was granted. */
export type AccessDecision =
  | { ok: true; iface: AccessibleInterface; authorising: readonly AuthorisingGrant[] }
  | AccessRefused;

export interface AuthorisesHereInput {
  readonly iface: AuthorisableInterface;
  /** The credential's own solution. */
  readonly solutionId: string;
  /** The credential's environment, as written on its row. */
  readonly environment: string;
  readonly route: BrokerRoute;
  /**
   * The grants fetched for this interface in this environment:
   * `grantsForInterfaceWhere` in SQL, or `grantFetchedFor` over a batch.
   */
  readonly grants: readonly AuthorisingGrant[];
  readonly now: Date;
  readonly bindingMode?: GrantBindingMode;
}

const NEEDS_REAPPROVAL_MESSAGE =
  "The access grant for this capability was approved before grants were bound to one interface, and this deployment does not honour such grants on this interface. Ask for it to be approved again against this interface.";

/**
 * The refusals the interface row decides alone, before any grant is looked at
 * — so a route never spends a grant query on them. In the order each route
 * has always asked them.
 */
export function interfaceRefusal(
  iface: Pick<AuthorisableInterface, "solutionId" | "mode" | "status" | "operation">,
  solutionId: string,
  route: BrokerRoute,
): AccessRefused | null {
  if (iface.solutionId !== solutionId) {
    // Same message as "not found" on purpose — a client must not be able to
    // discover which interfaces exist outside its own solution.
    return { ok: false, reason: "NOT_THIS_SOLUTION", message: "No such interface." };
  }
  if (route === "read") {
    // Mode is the harder gate: a write interface is refused whatever its grants say.
    if (iface.mode === "WRITE") {
      return {
        ok: false,
        reason: "WRITE_NOT_SERVED",
        message: "This interface is configured for writes, which this API does not serve.",
      };
    }
    // DRAFT continues and is flagged on the result instead of refused.
    if (iface.status === "DEPRECATED") {
      return {
        ok: false,
        reason: "INTERFACE_DEPRECATED",
        message: "This interface has been deprecated. Ask the solution's builder for its replacement.",
      };
    }
    return null;
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
   * — mode WRITE, status ACTIVE, and the grant filter accepts CREATE and UPDATE
   * alike — and then `writeEntitySet` POSTed it to the entity set. The
   * application asked to change a record; SAP created a new one; the broker
   * answered 201. Refused before the grant query and before an idempotency key
   * is reserved, so nothing reaches SAP and the refusal says why.
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
  return null;
}

/** Does this grant's decision authorise this route's call in this environment? */
export function grantAuthorises(grant: AuthorisingGrant, route: BrokerRoute, environment: string): boolean {
  const decision = grant.decision as GrantDecision;
  const env = environment as GrantEnvironment;
  if (route === "read") return grantsRead(decision, env);
  // A READ grant never authorises a write.
  return (grant.operation === "CREATE" || grant.operation === "UPDATE") && grantsWrite(decision, env);
}

const isLive = (g: AuthorisingGrant, now: Date): boolean =>
  // `== null` matches null and undefined alike. Prisma returns null for an
  // unset column, and a row read without this field selected must not be
  // mistaken for a revoked one — that would refuse traffic that was never
  // withdrawn, which is a louder failure than it looks.
  g.revokedAt == null && (g.expiresAt === null || g.expiresAt.getTime() > now.getTime());

/**
 * May this solution's credential in `environment` call this interface, right
 * now, on the grants fetched for it?
 *
 * The chain, and why each link exists:
 *   1. The interface must belong to the credential's own solution, and be of
 *      the route's mode and status (`interfaceRefusal`).
 *   2. A grant must be USABLE under the binding mode (wave 1a, grant-binding.ts:
 *      bound to this interface on its product, or a legacy unbound grant whose
 *      cut-off the interface predates, under legacy only).
 *   3. Its decision must authorise this route in this environment:
 *      SANDBOX_ONLY only in SANDBOX, READ_ONLY never for a write.
 *   4. It must not be revoked — checked before expiry, so the refusal names a
 *      human withdrawal rather than blaming the clock — nor expired, judged at
 *      CALL time so an expiry date is never decorative.
 */
export function authorisesHere(input: AuthorisesHereInput): AccessDecision {
  const { iface, solutionId, environment, route, grants, now } = input;
  const bindingMode = input.bindingMode ?? grantBindingMode();

  const refused = interfaceRefusal(iface, solutionId, route);
  if (refused) return refused;

  const authorises = (g: AuthorisingGrant) => grantAuthorises(g, route, environment);
  const what = route === "write" ? "WRITE grant" : "access grant";

  const granting = grantsUsableUnder(grants, iface, bindingMode).filter(authorises);
  if (granting.length === 0) {
    /*
     * Would an unbound grant the mode set aside have authorised this call?
     * Then the refusal names re-approval rather than a missing grant — the
     * remedy is different, and so is who acts.
     */
    if (grants.some((g) => !isUsableUnder(g, iface, bindingMode) && authorises(g) && isLive(g, now))) {
      return { ok: false, reason: "GRANT_NEEDS_REAPPROVAL", message: NEEDS_REAPPROVAL_MESSAGE };
    }
    return {
      ok: false,
      reason: "NO_APPROVED_GRANT",
      message:
        route === "write"
          ? `No approved WRITE grant for this capability in ${environment}.`
          : `No approved access grant for this capability in ${environment}.`,
    };
  }

  const unrevoked = granting.filter((g) => g.revokedAt == null);
  if (unrevoked.length === 0) {
    return {
      ok: false,
      reason: "GRANT_REVOKED",
      message: `The ${what} for this capability in ${environment} has been revoked.`,
    };
  }

  const live = unrevoked.filter((g) => isLive(g, now));
  if (live.length === 0) {
    return {
      ok: false,
      reason: "GRANT_EXPIRED",
      message: `The ${what} for this capability in ${environment} has expired.`,
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
      // The write path only reaches here for ACTIVE interfaces.
      draft: iface.status === "DRAFT",
      servicePath: iface.servicePath ?? null,
      odataVersion: iface.odataVersion ?? null,
      serviceVerifiedAt: iface.serviceVerifiedAt ?? null,
      serviceVerifications: iface.serviceVerifications ?? null,
    },
  };
}

/* ── the binding ───────────────────────────────────────────────────────── */

/**
 * What the broker knows about an organisation's connections for ONE product
 * before it picks one, in the order it finds it out:
 *
 *   - `unknownProduct`: the interface names a product the connector registry
 *     does not know, so no connection can ever serve it (UNKNOWN_PRODUCT).
 *   - `unreadable`: a stored row would not open — its secret sealed under a
 *     previous key, or an auth type outside the vocabulary. The broker fails
 *     closed on the whole set (CONNECTION_UNREADABLE): skipping the bad row
 *     could bind the call to a different connection than the estate intended.
 *   - `connections`: the active rows, opened or not; the selection reads only
 *     their environment and SAP client.
 *
 * binding.ts `loadBindingEstate` builds it from the database.
 */
export type BindingEstate<C extends BindableConnection> =
  | { readonly kind: "unknownProduct" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "connections"; readonly connections: readonly C[] };

export type BindingDecision<C extends BindableConnection> =
  | { readonly ok: true; readonly connection: C; readonly bindingUnverified: boolean }
  | { readonly ok: false; readonly reason: ConnectionBindingFailure };

/**
 * The ONE connection a call from this credential would go through, or why
 * none. Binds on the interface's product (the estate), the credential's
 * environment and its SAP client — never on environment alone, which is how
 * the board came to call two products in one environment ambiguous and a
 * credential bound to client 080 live on client 100's evidence (A15).
 */
export function bindingFor<C extends BindableConnection>(
  estate: BindingEstate<C>,
  environment: string,
  route: BrokerRoute,
  sapClient: string | null | undefined,
): BindingDecision<C> {
  if (estate.kind === "unknownProduct") return { ok: false, reason: "UNKNOWN_PRODUCT" };
  if (estate.kind === "unreadable") return { ok: false, reason: "CONNECTION_UNREADABLE" };
  return selectConnectionForEnvironment(estate.connections, environment, route === "write" ? "WRITE" : "READ", sapClient);
}

/* ── the write route's per-connection gates ────────────────────────────── */

export type WriteSwitchRefusal = "WRITES_DISABLED" | "CUSTOM_SERVICE_UNVERIFIED";

/**
 * A custom service writes only once verified through the very connection,
 * SAP client and host the write binds to, in the credential's environment
 * (service-verifications.ts). False for a catalogue interface.
 */
export function customServiceUnverified(
  iface: { readonly servicePath?: string | null; readonly serviceVerifications?: unknown },
  environment: string,
  connection: { readonly id: string; readonly client: string | null; readonly baseUrl: string },
): boolean {
  if (iface.servicePath == null || iface.servicePath === "") return false;
  return !isVerifiedForBinding(iface.serviceVerifications, {
    environment,
    connectionId: connection.id,
    sapClient: connection.client ?? null,
    baseUrl: connection.baseUrl,
  });
}

/**
 * Would the write route refuse this bound connection? Its two gates, in its
 * order: the connection's own write switch, then the custom-service
 * verification.
 */
export function writeSwitchRefusal(
  iface: { readonly servicePath?: string | null; readonly serviceVerifications?: unknown },
  environment: string,
  connection: { readonly id: string; readonly client: string | null; readonly baseUrl: string; readonly writeEnabled: boolean },
): WriteSwitchRefusal | null {
  if (!connection.writeEnabled) return "WRITES_DISABLED";
  if (customServiceUnverified(iface, environment, connection)) return "CUSTOM_SERVICE_UNVERIFIED";
  return null;
}

/* ── the app ───────────────────────────────────────────────────────────── */

export type SolutionRefusal = "SOLUTION_RETIRED" | "SOLUTION_MISSING";

/**
 * Is the solution that owns a credential still callable? RETIRED only:
 * RESTRICTED means an ACTIVE solution lost an owner, a governance flag and not
 * a decision to stop the integration (auth.ts SOLUTION_RETIRED).
 */
export function solutionRefusal(status: string | null): SolutionRefusal | null {
  if (status === null) return "SOLUTION_MISSING";
  if (status === "RETIRED") return "SOLUTION_RETIRED";
  return null;
}
