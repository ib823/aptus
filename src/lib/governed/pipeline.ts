/**
 * The governed pipeline (P0.14): every governed call to SAP is the same named
 * steps, and every refusal is a typed value with one HTTP status.
 *
 * WHY. The check sequence was hand-copied across the northbound read
 * (`src/app/api/northbound/interfaces/[id]/data/route.ts`), the write
 * (`.../data/write/route.ts`), the Studio broker run
 * (`src/app/api/studio/test/broker-run/route.ts`) and the Workbench preview
 * (`src/app/api/sap/tdd/preview/route.ts`). A copy is where the gates drift:
 * one route maps a refusal to 403, the next to 404, and nothing notices. Each
 * step now lives here once, and each route is the order it runs them in.
 *
 * THE STEPS, in the order a governed call meets them:
 *
 *   authenticate      who is calling: the bearer key (and, on a write, the
 *                     write key), or the signed-in person on a console read
 *   rateLimit         the caller's own budget, keyed by credential
 *   resolveInterface  what the call names: the interface, and on a write the
 *                     Idempotency-Key and body; the dataset it reads or writes
 *   authorise         the grant binding (access.ts, grant-binding.ts), or the
 *                     console's environment ceiling
 *   bindConnection    the customer's OWN connection for the credential's
 *                     environment and SAP client, and its transport
 *   contain           the circuit breaker for that SAP system (containment.ts)
 *   callSap           the executor, through the connection's transport
 *   audit             one NorthboundAuditEvent per call that got past
 *                     authentication, refused or not
 *
 * NO BEHAVIOUR CHANGE. The routes were ported onto these steps keeping their
 * own order, wording and audit rows: the golden rows in
 * tests/fixtures/governed-pipeline/golden-audit-rows.json were recorded from
 * the routes before the port and are checked against them on every run
 * (tests/integration/governed-pipeline-golden.test.ts). Where a route checks
 * the dataset after binding (so the audit row names the connection), it still
 * does; the step name says which gate refused, not when.
 *
 * TYPED REFUSALS. `REFUSAL_STATUS` is the one table of refusal reason to HTTP
 * status. Every step builds its refusal through `refusal()`, which reads the
 * table, so no route can answer the same reason with a different status; the
 * parity test (tests/unit/governed/refusal-parity.test.ts) drives every ported
 * route into each reason it can reach and checks the table holds.
 *
 * NO TRANSACTION IS HELD ACROSS SAP. No step opens a database transaction,
 * and `callSap` is never reached from inside one: the idempotency key is
 * reserved in its own statement before the call and completed in another
 * after it, and the audit row is a single insert (tests/unit/governed/
 * pipeline.test.ts checks this file and the ported routes never call
 * `$transaction`). A transaction open across a 45-second SAP write would hold
 * a pooled connection and its row locks for all of it.
 */

import type { NextResponse } from "next/server";

import {
  resolveReadableInterface,
  resolveWritableInterface,
  type AccessibleInterface,
  type AccessRefusal,
  type PrefetchedConnections,
} from "@/lib/northbound/access";
import {
  authenticateClientToken,
  extractBearer,
  LAST_USED_STAMP_INTERVAL_MS,
  lastUsedStampDue,
  touchClientLastUsed,
  type AuthenticatedClient,
  type PrefetchedWriteKey,
} from "@/lib/northbound/auth";
import type { ClaimStamp } from "@/lib/northbound/idempotency";
import { noteFailedCredential } from "@/lib/northbound/auth-failures";
import { bindingFor } from "@/lib/northbound/authorisation";
import { recordNorthboundCall, type NorthboundAuditInput } from "@/lib/northbound/audit";
import type { CallOutcome } from "@/lib/northbound/circuit-breaker";
import { readEntitySet, type NorthboundReadResult, type NorthboundReadStatus } from "@/lib/northbound/read";
import { resolveReadDefinition, type ReadDefinitionRefusal } from "@/lib/northbound/read-definition";
import { FAILURE_REASON_LIMITER_UNAVAILABLE, northboundError, type NorthboundErrorCode } from "@/lib/northbound/respond";
import { writeEntitySet, type NorthboundWriteResult } from "@/lib/northbound/write";
import { verifyWriteCredential } from "@/lib/northbound/write-credential";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { isLimiterOutage, LIMITER_UNAVAILABLE_MESSAGE, retryAfterSeconds } from "@/lib/security/rate-limit-response";
import {
  bindStoredConnections,
  connectionRefusalMessage,
  resolveSapConnectionForEnvironment,
  type ConnectionBindingFailure,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";
import type { ConsoleReadRefusal } from "@/lib/sap-public/console-read-guard";
import { getSapProduct, type SapOdataProduct, type SapServiceDefinition } from "@/lib/sap-public/tdd-connector";
import type { TenantScope } from "@/lib/studio/tenant-scope";

import {
  circuitBreakerMode,
  circuitKeyForConnection,
  FAILURE_REASON_CIRCUIT_OPEN,
  governedCircuitBreaker,
} from "./containment";
import { afterResponse } from "./after-response";
import { transportFor, transportRefusal, type Transport } from "./transport";

/* ── the steps and the refusal table ──────────────────────────────────── */

export const PIPELINE_STEPS = [
  "authenticate",
  "rateLimit",
  "resolveInterface",
  "authorise",
  "bindConnection",
  "contain",
  "callSap",
  "audit",
] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/**
 * Every grant-gate refusal access.ts can give. A Record over the union, so a
 * new reason there does not compile until it has a status here.
 */
const ACCESS_REFUSAL_STATUS: Readonly<Record<AccessRefusal, 400 | 403 | 404>> = {
  // Same answer as "not found" on purpose: a caller must not learn which
  // interfaces exist outside its own solution.
  INTERFACE_NOT_FOUND: 404,
  NOT_THIS_SOLUTION: 404,
  NO_APPROVED_GRANT: 403,
  GRANT_EXPIRED: 403,
  GRANT_REVOKED: 403,
  GRANT_NEEDS_REAPPROVAL: 403,
  WRITE_NOT_SERVED: 403,
  READ_ONLY_INTERFACE: 403,
  INTERFACE_NOT_ACTIVE: 403,
  INTERFACE_DEPRECATED: 403,
  // Nothing about access is wrong: it is a gap in the interface's definition.
  OPERATION_NOT_SUPPORTED: 400,
};

/** Every binding refusal: the connection the credential needs is not there to bind. */
const BINDING_REFUSAL_STATUS: Readonly<Record<ConnectionBindingFailure, 403>> = {
  NO_CONNECTION: 403,
  NO_MATCH_FOR_CLIENT: 403,
  NO_MATCH_FOR_ENVIRONMENT: 403,
  AMBIGUOUS: 403,
  NO_DECLARED_CANDIDATE: 403,
  UNDECLARED_ENVIRONMENT_WRITE: 403,
  CONNECTION_UNREADABLE: 403,
  UNKNOWN_PRODUCT: 403,
};

/** The interface names something the broker cannot call. Always the definition's gap, never access. */
const DEFINITION_REFUSAL_STATUS: Readonly<Record<ReadDefinitionRefusal | "ENTITY_NOT_YOURS_TO_CHOOSE" | "CUSTOM_SERVICE_UNVERIFIED", 400>> = {
  NO_ENTITY_SET: 400,
  SERVICE_PATH_INVALID: 400,
  SERVICE_UNRESOLVED: 400,
  ENTITY_NOT_YOURS_TO_CHOOSE: 400,
  CUSTOM_SERVICE_UNVERIFIED: 400,
};

/** The console's own ceiling (console-read-guard.ts). */
const CONSOLE_REFUSAL_STATUS: Readonly<Record<ConsoleReadRefusal, 403>> = {
  NO_APPROVED_GRANT: 403,
  UNDECLARED_ENVIRONMENT: 403,
  SANDBOX_ONLY: 403,
};

/**
 * THE TABLE: one HTTP status per refusal reason, across every governed entry
 * point. The Test Console answers its refusals inside a 200 (it renders them
 * as outcomes), so for it the status is the one its audit row records — the
 * status the deployed application would have been given.
 */
export const REFUSAL_STATUS = {
  // authenticate
  UNAUTHENTICATED: 401,
  WRITE_CREDENTIAL_INVALID: 403,
  // rateLimit
  RATE_LIMITED: 429,
  LIMITER_UNAVAILABLE: 503,
  // resolveInterface: what the request names
  IDEMPOTENCY_KEY_INVALID: 400,
  BODY_INVALID: 400,
  ...DEFINITION_REFUSAL_STATUS,
  // authorise (and resolveInterface for the two not-found reasons)
  ...ACCESS_REFUSAL_STATUS,
  ...CONSOLE_REFUSAL_STATUS,
  // bindConnection
  ...BINDING_REFUSAL_STATUS,
  WRITES_DISABLED: 403,
  TRANSPORT_UNAVAILABLE: 503,
  // A deployment tenant (`{PREFIX}_*`, ARIBA_*) on a host a stored connection
  // could not be saved with, under COREEDGE_ENV_TENANT_HOSTS=enforce (P0.14b,
  // governed/console.ts). The console's refusal; the broker binds stored
  // connections only, which were checked when they were saved.
  HOST_NOT_ALLOWED: 403,
  // contain
  CIRCUIT_OPEN: 503,
  // the write's idempotency store, between contain and callSap
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENCY_IN_FLIGHT: 409,
} as const;

export type RefusalReason = keyof typeof REFUSAL_STATUS;

/** The code a client branches on, per reason. */
function codeFor(reason: RefusalReason, status: number): NorthboundErrorCode {
  if (reason === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (reason === "RATE_LIMITED") return "RATE_LIMITED";
  if (reason === "LIMITER_UNAVAILABLE") return "LIMITER_UNAVAILABLE";
  if (reason === "CIRCUIT_OPEN") return "CIRCUIT_OPEN";
  if (reason === "IDEMPOTENCY_CONFLICT" || reason === "IDEMPOTENCY_IN_FLIGHT") return "CONFLICT";
  if (reason in BINDING_REFUSAL_STATUS || reason === "TRANSPORT_UNAVAILABLE") return "CONNECTION_NOT_CONFIGURED";
  if (status === 404) return "NOT_FOUND";
  if (status === 400) return "VALIDATION_ERROR";
  return "FORBIDDEN";
}

/** What a refusal adds to the call's audit row. */
export interface RefusalAudit {
  /** The connection the call was bound to, when it got that far. */
  readonly connection?: { readonly id: string; readonly environment: string | null } | null;
  readonly bindingRefusal?: string | null;
  readonly failureReason?: string | null;
}

export interface Refusal {
  readonly step: PipelineStep;
  readonly reason: RefusalReason;
  readonly status: number;
  readonly code: NorthboundErrorCode;
  /** Safe for the caller: never a host, a credential or another organisation's data. */
  readonly message: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly audit: RefusalAudit;
  /** The limiter's reset, on a rate-limit refusal, for routes that word their own sentence. */
  readonly resetMs?: number;
}

export type StepResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: Refusal };

export function refusal(
  step: PipelineStep,
  reason: RefusalReason,
  message: string,
  extra: { headers?: Record<string, string>; audit?: RefusalAudit; resetMs?: number } = {},
): Refusal {
  const status = REFUSAL_STATUS[reason];
  return {
    step,
    reason,
    status,
    code: codeFor(reason, status),
    message,
    headers: extra.headers ?? {},
    audit: extra.audit ?? {},
    ...(extra.resetMs === undefined ? {} : { resetMs: extra.resetMs }),
  };
}

const passed = <T>(value: T): StepResult<T> => ({ ok: true, value });
const refused = <T>(r: Refusal): StepResult<T> => ({ ok: false, refusal: r });

/** A northbound refusal, in the northbound envelope. */
export function northboundRefusalResponse(r: Refusal, correlationId: string): NextResponse {
  return northboundError(r.code, r.message, r.status, correlationId, { ...r.headers });
}

/* ── audit ────────────────────────────────────────────────────────────── */

/**
 * What every row of one call carries. The optional fields are the call's
 * defaults: the write route states each of them on every row (null, false),
 * as it always has, and a row's own extras override them.
 */
type AuditBase = Pick<
  NorthboundAuditInput,
  "organizationId" | "solutionId" | "operation" | "environment" | "correlationId" | "clientTokenId"
> &
  Partial<
    Pick<
      NorthboundAuditInput,
      | "dryRun"
      | "actorUserId"
      | "connectionId"
      | "connectionEnvironment"
      | "durationMs"
      | "bindingRefusal"
      | "failureReason"
      | "replayed"
    >
  >;

export interface AuditExtras {
  readonly rowCount?: number | null;
  readonly connection?: { readonly id: string; readonly environment: string | null } | null;
  readonly durationMs?: number | null;
  readonly bindingRefusal?: string | null;
  readonly failureReason?: string | null;
  readonly replayed?: boolean;
}

/**
 * The audit step: one row per call, about what the call had reached. The
 * route says what the call is about (`about`) as each step resolves it — an
 * interface id the caller sent, then the interface itself — and every row it
 * records names that, so a refusal is audited against exactly what was known
 * when it happened.
 */
export class GovernedAudit {
  private subject: { interfaceId: string | null; externalId: string };

  constructor(
    private readonly base: AuditBase,
    subject: { interfaceId: string | null; externalId: string } = { interfaceId: null, externalId: "-" },
  ) {
    this.subject = subject;
  }

  about(interfaceId: string | null, externalId: string): this {
    this.subject = { interfaceId, externalId };
    return this;
  }

  record(status: number, extras: AuditExtras = {}): Promise<void> {
    return recordNorthboundCall({
      ...this.base,
      ...this.subject,
      status,
      rowCount: extras.rowCount ?? null,
      ...(extras.connection === undefined
        ? {}
        : { connectionId: extras.connection?.id ?? null, connectionEnvironment: extras.connection?.environment ?? null }),
      ...(extras.durationMs === undefined ? {} : { durationMs: extras.durationMs }),
      ...(extras.bindingRefusal === undefined ? {} : { bindingRefusal: extras.bindingRefusal }),
      ...(extras.failureReason === undefined ? {} : { failureReason: extras.failureReason }),
      ...(extras.replayed === undefined ? {} : { replayed: extras.replayed }),
    });
  }

  /** The row for a refusal: its status, and what the refusal says it reached. */
  refused(r: Refusal): Promise<void> {
    return this.record(r.status, {
      ...(r.audit.connection === undefined ? {} : { connection: r.audit.connection }),
      ...(r.audit.bindingRefusal === undefined ? {} : { bindingRefusal: r.audit.bindingRefusal }),
      ...(r.audit.failureReason === undefined ? {} : { failureReason: r.audit.failureReason }),
    });
  }
}

/* ── authenticate ─────────────────────────────────────────────────────── */

/**
 * The bearer key. Every failure is the same 401 for the caller; the reason is
 * logged with the correlation id, and a key matching no row spends the
 * address's failed-lookup budget (auth-failures.ts). On success the key's
 * last use is stamped, fire-and-forget.
 */
export async function authenticate(
  headers: Headers,
  correlationId: string,
  logTag: string,
  options: { readonly withWriteKey?: boolean } = {},
): Promise<StepResult<AuthenticatedClient>> {
  const bearer = extractBearer(headers.get("authorization"));
  const auth = options.withWriteKey === true
    ? await authenticateClientToken(bearer, new Date(), { withWriteKey: true })
    : await authenticateClientToken(bearer);
  if (!auth.ok) {
    console.warn(`[${logTag}] auth rejected`, { reason: auth.reason, correlationId });
    await noteFailedCredential(headers, bearer, auth.reason);
    return refused(refusal("authenticate", "UNAUTHENTICATED", "Missing or invalid client token."));
  }
  // At most once a minute per key (auth.ts LAST_USED_STAMP_INTERVAL_MS), and
  // after the response is sent (P0.19). Never awaited: it decides nothing.
  // Unless a statement the call sends anyway carried it first
  // (carryLastUsedStamp): whichever comes first takes it, the other does not.
  const { clientId, organizationId } = auth.client;
  const stamp: PendingStamp = { lastUsedAt: auth.lastUsedAt, taken: false };
  pendingStamps.set(auth.client, stamp);
  void afterResponse(async () => {
    if (stamp.taken) return;
    stamp.taken = true;
    await touchClientLastUsed(clientId, organizationId, auth.lastUsedAt);
  });
  if (auth.writeKey) prefetchedWriteKeys.set(auth.client, auth.writeKey);
  return passed(auth.client);
}

interface PendingStamp {
  readonly lastUsedAt: Date | null | undefined;
  taken: boolean;
}

/** The key's `lastUsedAt` stamp, until it is written. Weak: gone with the request. */
const pendingStamps = new WeakMap<AuthenticatedClient, PendingStamp>();

/**
 * Hand the key's `lastUsedAt` stamp, when it is due, to a statement the call
 * sends anyway (P0.19 review round 1). The write route's Idempotency-Key
 * claim carries it (idempotency.ts claimStatement), so the minute's first
 * write, replay or conflict of a key costs no statement of its own; the
 * stamp after the response then writes nothing. Null when it is not due,
 * already written, or authentication did not run. The SQL repeats the
 * once-a-minute condition, so a stamp racing another call's is a no-op.
 */
export function carryLastUsedStamp(client: AuthenticatedClient, now: Date = new Date()): ClaimStamp | null {
  const stamp = pendingStamps.get(client);
  if (!stamp || stamp.taken || !lastUsedStampDue(stamp.lastUsedAt, now)) return null;
  stamp.taken = true;
  return { clientId: client.clientId, at: now, staleBefore: new Date(now.getTime() - LAST_USED_STAMP_INTERVAL_MS) };
}

/**
 * The write-key fields authentication read with the key (P0.19), held beside
 * the client object rather than on it, so nothing that logs or spreads the
 * client carries the sealed value. Weak: gone with the request.
 */
const prefetchedWriteKeys = new WeakMap<AuthenticatedClient, PrefetchedWriteKey>();

/** The write key: a second secret, verified against THIS credential's row. */
export async function authenticateWriteKey(client: AuthenticatedClient, writeSecret: string | null): Promise<StepResult<void>> {
  const prefetched = prefetchedWriteKeys.get(client);
  const ok = prefetched
    ? await verifyWriteCredential(client.scope, client.clientId, writeSecret, new Date(), {
        solutionId: client.solutionId,
        ...prefetched,
      })
    : await verifyWriteCredential(client.scope, client.clientId, writeSecret);
  return ok
    ? passed(undefined)
    : refused(refusal("authenticate", "WRITE_CREDENTIAL_INVALID", "A valid write credential is required for this operation."));
}

/* ── rateLimit ────────────────────────────────────────────────────────── */

/**
 * The credential's own bucket. 429 RATE_LIMITED for its own use, 503
 * LIMITER_UNAVAILABLE when the limiter could not be asked (A44); both carry
 * Retry-After, and the outage is audited with its reason.
 */
export async function rateLimit(bucket: string, limitedMessage: string): Promise<StepResult<void>> {
  const rate = await checkRateLimit(bucket, RATE_LIMITS.northbound);
  if (rate.allowed) return passed(undefined);
  const headers = { "retry-after": retryAfterSeconds(rate) };
  if (isLimiterOutage(rate)) {
    return refused(
      refusal("rateLimit", "LIMITER_UNAVAILABLE", LIMITER_UNAVAILABLE_MESSAGE, {
        headers,
        audit: { failureReason: FAILURE_REASON_LIMITER_UNAVAILABLE },
        resetMs: rate.resetMs,
      }),
    );
  }
  return refused(refusal("rateLimit", "RATE_LIMITED", limitedMessage, { headers, audit: { failureReason: null }, resetMs: rate.resetMs }));
}

/* ── resolveInterface + authorise ─────────────────────────────────────── */

function accessStep(reason: AccessRefusal): PipelineStep {
  return reason === "INTERFACE_NOT_FOUND" || reason === "NOT_THIS_SOLUTION" ? "resolveInterface" : "authorise";
}

/**
 * The interface the call names, and the grant that authorises it: one query
 * in access.ts answers both. A not-found is the resolveInterface step's
 * refusal, every other reason the grant binding's.
 */
export async function authorise(
  operation: "READ" | "WRITE",
  scope: TenantScope,
  solutionId: string,
  interfaceId: string,
  environment: string,
  now?: Date,
): Promise<StepResult<AccessibleInterface>> {
  // The connections that may serve the call come back in the interface's
  // statement (P0.19), for bindConnection.
  const options = { withConnections: true } as const;
  const access =
    operation === "READ"
      ? await resolveReadableInterface(scope, solutionId, interfaceId, environment, now ?? new Date(), options)
      : await resolveWritableInterface(scope, solutionId, interfaceId, environment, new Date(), options);
  if (!access.ok) return refused(refusal(accessStep(access.reason), access.reason, access.message));
  if (access.connections) prefetched.set(access.iface, { organizationId: scope.organizationId, ...access.connections });
  return passed(access.iface);
}

/**
 * The connections authorise read with the interface, held beside it (not on
 * it: the rows carry sealed secrets) until bindConnection takes them.
 */
const prefetched = new WeakMap<AccessibleInterface, PrefetchedConnections & { readonly organizationId: string }>();

/** What authorise read for bindConnection, for the interface it returned; undefined otherwise. */
export function prefetchedConnectionsFor(
  iface: AccessibleInterface,
): (PrefetchedConnections & { readonly organizationId: string }) | undefined {
  return prefetched.get(iface);
}

/* ── bindConnection ───────────────────────────────────────────────────── */

export interface Bound {
  readonly product: SapOdataProduct;
  readonly connection: ResolvedSapConnection;
  readonly bindingUnverified: boolean;
  readonly transport: Transport;
}

/**
 * The customer's OWN connection, bound to the credential's environment and
 * SAP client — never the shared env tenant, never simply the oldest row. An
 * interface whose product the registry does not know is UNKNOWN_PRODUCT, not
 * NO_CONNECTION: a configuration defect with a different fix, which the
 * incident rule must count.
 *
 * And the connection's transport: a TWIN connection on a deployment with no
 * twin engine is refused here, before anything is called (transport.ts).
 */
export async function bindConnection(
  organizationId: string,
  sapProduct: string,
  environment: string,
  operation: "READ" | "WRITE",
  sapClient: string | null,
  /**
   * The rows authorise already read (prefetchedConnectionsFor, P0.19). Used
   * only when they are this organisation's rows for this product; otherwise,
   * or without them, the connections are read here as before.
   */
  rows?: PrefetchedConnections & { readonly organizationId: string },
): Promise<StepResult<Bound>> {
  const product = getSapProduct(sapProduct);
  const usable = rows !== undefined && rows.organizationId === organizationId && rows.product === sapProduct;
  // Every branch is authorisation.ts `bindingFor` (P0.2), the predicate the
  // lane board and the lane sweep ask of the same estate: on an unknown
  // product directly, on stored rows through the resolver.
  const binding = !product
    ? bindingFor<ResolvedSapConnection>({ kind: "unknownProduct" }, environment, operation === "WRITE" ? "write" : "read", sapClient)
    : usable && organizationId
      ? await bindStoredConnections(rows.rows, environment, operation, sapClient)
      : await resolveSapConnectionForEnvironment(organizationId, sapProduct, environment, operation, sapClient);
  if (!binding.ok) {
    return refused(
      refusal("bindConnection", binding.reason, connectionRefusalMessage(binding.reason, environment), {
        audit: { bindingRefusal: binding.reason },
      }),
    );
  }
  // transport.ts `transportRefusal`: the predicate the lane board and
  // discovery's `callable` ask too (wave 2 integration review round 3).
  const transport = transportFor(binding.connection);
  const unavailable = transportRefusal(binding.connection);
  if (unavailable !== null) {
    return refused(
      refusal(
        "bindConnection",
        unavailable,
        "This connection is served by the Tenant Twin, which is not available on this deployment.",
        { audit: { connection: binding.connection } },
      ),
    );
  }
  // `product!` is sound: a null product forces the binding to fail above.
  return passed({ product: product!, connection: binding.connection, bindingUnverified: binding.bindingUnverified, transport });
}

/** The connection's own write veto, which overrides any grant. */
export function requireWritesEnabled(connection: ResolvedSapConnection): StepResult<void> {
  return connection.writeEnabled
    ? passed(undefined)
    : refused(refusal("bindConnection", "WRITES_DISABLED", "Writes are not enabled on this SAP connection.", { audit: { connection } }));
}

/* ── the dataset the call reads ───────────────────────────────────────── */

/**
 * The service and entity set the broker reads, or why it would refuse
 * (read-definition.ts, which also decides discovery's `callable`). The words
 * belong to the entry point: a deployed app and a builder in the console are
 * told the same fact differently.
 */
export async function resolveReadTarget(
  product: SapOdataProduct,
  iface: Parameters<typeof resolveReadDefinition>[1],
  connection: ResolvedSapConnection,
  messageFor: (reason: ReadDefinitionRefusal) => string,
): Promise<StepResult<{ service: SapServiceDefinition; entitySet: string }>> {
  const definition = await resolveReadDefinition(product, iface);
  if (definition.ok) return passed({ service: definition.service, entitySet: definition.entitySet });
  return refused(refusal("resolveInterface", definition.reason, messageFor(definition.reason), { audit: { connection } }));
}

/* ── contain ──────────────────────────────────────────────────────────── */

/** What a call let through the breaker must report back. */
export interface CircuitPermit {
  record(outcome: CallOutcome): Promise<void>;
}

const NO_CIRCUIT: CircuitPermit = { record: async () => undefined };

/**
 * The circuit breaker for the SAP system behind this connection
 * (containment.ts). Under the default `observe` it only counts and logs; under
 * `enforce` an open circuit refuses before anything is sent to SAP. A twin
 * connection has no SAP system behind it and no circuit.
 */
export async function contain(bound: Pick<Bound, "connection" | "transport">, correlationId: string): Promise<StepResult<CircuitPermit>> {
  const mode = circuitBreakerMode();
  if (mode === "off" || !bound.transport.reachesSap) return passed(NO_CIRCUIT);
  return containKey(circuitKeyForConnection(bound.connection.id), correlationId, mode, { connection: bound.connection });
}

/** The same step for a system named by key (the console's deployment tenant). */
export async function containKey(
  key: string,
  correlationId: string,
  mode = circuitBreakerMode(),
  audit: RefusalAudit = {},
): Promise<StepResult<CircuitPermit>> {
  if (mode === "off") return passed(NO_CIRCUIT);
  const breaker = governedCircuitBreaker();
  const decision = await breaker.beforeCall(key);
  if (decision.allowed) return passed({ record: (outcome) => breaker.recordOutcome(key, outcome) });
  if (mode === "observe") {
    console.warn("[circuit] would refuse", {
      circuit: key,
      state: decision.state,
      retryAfterSeconds: decision.retryAfterSeconds,
      correlationId,
      shared: breaker.shared,
    });
    /*
     * THE CALL GOES AHEAD, ITS OUTCOME IS NOT RECORDED. Enforcing, this call
     * would never have reached SAP, so it would have recorded nothing; were
     * its success recorded here, it would close the circuit at once and
     * every later call in the cooldown would log nothing. Recording nothing
     * keeps the stored circuit on the enforce timeline, so the would-refuse
     * lines count exactly the calls enforce would refuse — which is what the
     * runbook's decision to enforce is made from.
     */
    return passed(NO_CIRCUIT);
  }
  const retry = String(Math.max(1, decision.retryAfterSeconds ?? 1));
  return refused(
    refusal(
      "contain",
      "CIRCUIT_OPEN",
      `The SAP system behind this connection failed repeatedly, so CoreEdge is not calling it for the next ${retry}s. Nothing was sent to SAP. Retry after Retry-After.`,
      { headers: { "retry-after": retry }, audit: { ...audit, failureReason: FAILURE_REASON_CIRCUIT_OPEN } },
    ),
  );
}

/** What a read outcome says about the SAP system's health. A refusal from a healthy system is not a failure. */
export function circuitOutcomeForRead(status: NorthboundReadStatus): CallOutcome {
  if (status === "OK" || status === "EMPTY") return "ok";
  if (status === "TIMEOUT") return "timeout";
  if (status === "ERROR") return "upstream-error";
  return "refused";
}

/**
 * What a write outcome says about the SAP system's health.
 *
 * THE CALLER CHOSE THE PAYLOAD. SAP answers a bad one with a 500 (a Gateway
 * technical exception, a RAP short dump on a field value) as readily as with
 * a 400, and enough writes earn a 429. Counted, five such writes from one
 * solution would open the circuit every solution on the connection shares,
 * and under enforce refuse their reads while SAP is healthy. So an answer SAP
 * gave to the POST never counts, whatever its status, and neither does a
 * throttle (408 or 429, at either step). What counts is what SAP did not
 * answer: a timeout, a host that could not be reached, a credential that
 * could not be obtained, a CSRF handshake (no payload in it) that failed. The
 * production reads, whose query the interface fixes, still count SAP's 5xx.
 */
export function circuitOutcomeForWrite(
  result: Pick<NorthboundWriteResult, "status" | "httpStatus" | "attempted">,
): CallOutcome {
  if (result.status === "CREATED") return "ok";
  if (result.status === "TIMEOUT") return "timeout";
  if (result.status !== "ERROR") return "refused";
  if (result.httpStatus === null) return "upstream-error";
  if (result.httpStatus === 408 || result.httpStatus === 429) return "refused";
  // SAP answered the POST itself: the payload's answer, not the system's health.
  if (result.attempted) return "refused";
  return "upstream-error";
}

/**
 * A console read: answered, or failed, with the status it is audited under
 * and the HTTP status SAP itself gave (null when SAP gave none: a timeout, a
 * host that could not be reached, a credential that could not be used).
 *
 * THE CALLER CHOSE THE QUERY. On the Workbench preview the builder names the
 * entity set, so SAP's own 4xx answer (a parameterised set asked without its
 * parameters, a set the arrangement does not release) says the question was
 * wrong, not that the system is failing — the write's REJECTED, not ERROR.
 * The audit row still records it as 502 (console-read-failure.ts); the
 * circuit counts it as a refusal. Only SAP's 5xx, a timeout, or a system that
 * could not be reached counts against the system.
 */
export function circuitOutcomeForConsoleRead(auditStatus: number, sapStatus: number | null): CallOutcome {
  if (auditStatus >= 200 && auditStatus < 300) return "ok";
  if (sapStatus !== null && sapStatus >= 400 && sapStatus < 500) return "refused";
  if (auditStatus === 504) return "timeout";
  if (auditStatus >= 500) return "upstream-error";
  return "refused";
}

/* ── callSap ──────────────────────────────────────────────────────────── */

/**
 * What a call to SAP returns: the executor's result, and how long the
 * upstream call took — timed around the executor only, before the outcome is
 * reported to the breaker. Operations shows this as "how slow is this
 * tenant" and the correlation search as "Took"; reporting to the breaker is
 * one or two Upstash round trips, and folding them in would show a slow
 * Redis as a slow SAP tenant.
 */
export interface SapCall<R> {
  readonly result: R;
  readonly durationMs: number;
}

/**
 * The read, through the connection's transport, with its outcome reported to
 * the breaker. A DIRECT connection is called exactly as before the transport
 * existed: the executor's own default fetch and credential step. Any other
 * transport supplies both, so a TWIN call exchanges no token either.
 */
export async function callSapRead(
  bound: Pick<Bound, "connection" | "transport">,
  input: { servicePath: string; entitySet: string; limit: number },
  permit: CircuitPermit,
): Promise<SapCall<NorthboundReadResult>> {
  const args = { connection: bound.connection, ...input };
  const startedAt = Date.now();
  const result = await (bound.transport.kind === "DIRECT"
    ? readEntitySet(args)
    : readEntitySet(args, bound.transport.fetch, bound.transport.authHeaders));
  const durationMs = Date.now() - startedAt;
  await permit.record(circuitOutcomeForRead(result.status));
  return { result, durationMs };
}

/** A write SAP was asked to make, whose outcome the breaker has not yet been told. */
export interface SapWriteCall extends SapCall<NorthboundWriteResult> {
  /**
   * Tell the breaker. Never throws, and is bounded (containment.ts). The
   * write route calls it LAST, after the Idempotency-Key is completed and the
   * audit row written, and in a `finally`: SAP may already have created the
   * record, so its outcome is stored and audited before anything that talks
   * to the breaker's store can delay it.
   */
  reportOutcome(): Promise<void>;
}

/** The write, likewise, except that the caller reports the outcome (see SapWriteCall). */
export async function callSapWrite(
  bound: Pick<Bound, "connection" | "transport">,
  input: { servicePath: string; entitySet: string; payload: Record<string, unknown> },
  permit: CircuitPermit,
): Promise<SapWriteCall> {
  const args = { connection: bound.connection, ...input };
  const startedAt = Date.now();
  const result = await (bound.transport.kind === "DIRECT"
    ? writeEntitySet(args)
    : writeEntitySet(args, bound.transport.fetch, bound.transport.authHeaders));
  const durationMs = Date.now() - startedAt;
  return { result, durationMs, reportOutcome: () => permit.record(circuitOutcomeForWrite(result)) };
}
