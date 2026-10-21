/**
 * The Workbench console on the governed pipeline (roadmap P0.14b).
 *
 * WHY. The broker's entry points run the named steps in pipeline.ts. The
 * Workbench console — the routes under /api/sap/tdd/* and /api/sap/ariba/*
 * that a PERSON drives from the explorer, Discover and the catalogue — reached
 * SAP through the Workbench connector (`sapFetch`, tdd-connector.ts) or the
 * Ariba connector instead, each route hand-copying its own gates: a role gate,
 * then (on some) the sandbox developer's ceiling, then (on some) the
 * environment ceiling, then (on one, the preview) a circuit, then an audit row
 * written by a local closure. Three of them wrote no row at all, and the
 * deployment's own tenants were never held to the host allow-list stored
 * connections pass. This module is those steps once, for the console, so every
 * console route is the order it runs them in, and the A.3 #9 static test
 * (tests/unit/security/no-side-doors.test.ts) can prove no route reaches SAP
 * any other way.
 *
 * THE PRINCIPAL. A console call is made by a named principal, "console",
 * acting for a signed-in person: not a credential, not a solution. Every row
 * says so — the organization's row carries the person as `actorUserId` with
 * `dryRun: true` and no solution or credential (as recordConsoleRead always
 * wrote it), and the platform row carries `detail.principal: "console"`.
 *
 * THE STEPS, mapped onto the pipeline's (pipeline.ts PIPELINE_STEPS):
 *
 *   authenticate   the route's own role gate (refuseUnlessMayProbeTenant,
 *                  requireAdmin …) and a non-null viewer; `openConsoleCall`
 *                  takes the viewer that gate let through
 *   rateLimit      the edge's sapLive bucket (security/rate-limit.ts
 *                  isLiveSapTenantRoute), and Probe all's own per-tenant limit
 *   resolve        the route resolves the tenant (resolveReadTenant) and the
 *                  service, and words its own 400s
 *   authorise      `authorise()`: the sandbox developer's SANDBOX ceiling
 *                  (P0.13), then, for a stored connection, the environment
 *                  ceiling (console-read-guard.ts decideConsoleRead)
 *   bindConnection `bind()`: a deployment tenant's or Ariba's configured hosts
 *                  against the stored-connection allow-list
 *                  (sap-public/env-tenant-hosts.ts, COREEDGE_ENV_TENANT_HOSTS)
 *   contain        `contain()`: the console's own circuit for this system in
 *                  this organization's console scope (containment.ts
 *                  circuitKeyForConsoleRead), observing unless
 *                  COREEDGE_CIRCUIT_BREAKER=enforce
 *   callSap        `callSap(fn, describe)`: the connector call, timed, its
 *                  outcome reported to the circuit
 *   audit          automatic. Every refusal by a step above and every call
 *                  `callSap` makes writes the organization's console row
 *                  (NorthboundAuditEvent, dryRun) where there is a tenant to
 *                  file it under, and the platform-scope row
 *                  (PlatformAuditEvent `SAP_CONSOLE_READ`) always. A route
 *                  cannot reach SAP through this module without both.
 *
 * `callSap` REFUSES TO RUN until authorise, bind and contain have passed — a
 * route that skips a step fails its own tests, not production.
 *
 * WRITES. The write-back (`/api/sap/tdd/write`, `hub-content/write-test`)
 * opens a call in `write` mode: the same principal, authorise and bind, and
 * `callSapWrite(handle, fn)`, which takes the handle P0.7's fail-closed
 * `beginPlatformAudit` returns — so a write cannot reach SAP through here
 * without its audit row having been written first. Those routes keep their
 * P0.7 begin/complete pair as their trail; this module writes no read row
 * for them, and they take no circuit (the payload is the person's choice and
 * the write's own outcome is the record, as P0.7 decided).
 *
 * NOT BILLED. Neither row is broker traffic: the usage rollup counts
 * `dryRun: false` NorthboundAuditEvent rows only (commercial/coreedge-usage.ts),
 * and reads nothing from the platform trail.
 *
 * NOTHING HERE HOLDS A TRANSACTION ACROSS SAP. Each row is one statement,
 * written after the call (pipeline.ts header, P0.19).
 */

import {
  CONSOLE_READ_OUTCOMES,
  consoleReadOutcome,
  recordPlatformConsoleRead,
  type ConsoleReadOutcomeKind,
  type PlatformAuditHandle,
} from "@/lib/audit/platform-audit";
import {
  decideConsoleRead,
  decideSandboxDeveloperRead,
  DEPLOYMENT_AUDIT_SCOPE,
  newCorrelationId,
  recordConsoleRead,
} from "@/lib/sap-public/console-read-guard";
import {
  aribaUrls,
  checkConfiguredUrls,
  deploymentTenantUrls,
  envTenantHostMode,
  warnUnlistedHosts,
  type HostCheck,
} from "@/lib/sap-public/env-tenant-hosts";
import type { ResolvedReadTenant } from "@/lib/sap-public/tenant-for-read";

import { circuitKeyForConnection, circuitKeyForConsoleRead, circuitKeyForDeploymentTenant } from "./containment";
import {
  circuitOutcomeForConsoleRead,
  containKey,
  refusal,
  type CircuitPermit,
  type Refusal,
  type StepResult,
} from "./pipeline";

/** The failureReason a HOST_NOT_ALLOWED refusal is audited with (correlation-lookup.ts reads it). */
export const FAILURE_REASON_HOST_NOT_ALLOWED = "HOST_NOT_ALLOWED";

/** The principal every console call is made as. */
export const CONSOLE_PRINCIPAL = "console" as const;

/** The person the route's own gate let through. */
export interface ConsoleViewer {
  readonly id: string;
  readonly email?: string | null;
  readonly role: string;
  readonly organizationId?: string | null;
}

/** What a console call reaches. */
export type ConsoleTarget =
  | {
      readonly kind: "odata";
      readonly product: { readonly key: string; readonly envPrefix: string };
      readonly resolved: ResolvedReadTenant;
    }
  | { readonly kind: "ariba"; readonly realm: string };

export interface ConsoleCallInput {
  readonly viewer: ConsoleViewer;
  readonly target: ConsoleTarget;
  /** The route, as its path: on the platform row, so an operator knows which screen read. */
  readonly route: string;
  /** What the call is about: the service key, or a fan-out's scope sentinel (`-operations-` …). */
  readonly externalId: string;
  /** The entity set the person named, when the call names one. */
  readonly entitySet?: string;
  readonly servicePath?: string | null;
  /** The parameters the person chose: fingerprinted on the platform row, never stored. */
  readonly request?: Record<string, unknown>;
  /** `write`: the P0.7 write-back, whose trail is its own begin/complete pair. Default `read`. */
  readonly mode?: "read" | "write";
}

/** What one call to SAP is audited as. */
export interface ConsoleOutcome {
  /** The status the read is recorded under (console-read-failure.ts decides it for a failure). */
  readonly status: number;
  /** Records read, or, for a fan-out, requests made. Null when nothing came back. */
  readonly rowCount: number | null;
  readonly failureReason?: string | null;
  /** The HTTP status SAP itself gave, for the circuit: its 4xx to a builder's query is not a failing system. */
  readonly sapStatus?: number | null;
  /** This row's subject, when it is not the call's (a fan-out's sentinel). */
  readonly externalId?: string;
}

export type ConsoleSapResult<T> =
  | { readonly ok: true; readonly value: T; readonly durationMs: number }
  | { readonly ok: false; readonly error: unknown; readonly durationMs: number };

/** A route called a step out of order. A programming error, never a refusal. */
export class ConsolePipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsolePipelineError";
  }
}

const passed = (): StepResult<void> => ({ ok: true, value: undefined });

const hostRefusalMessage =
  "This system is configured on this deployment at a host that is not on the SAP host allow-list a stored " +
  "connection must pass, so the console does not call it. Nothing was sent. An operator can add the domain to " +
  "SAP_HOST_ALLOWLIST_EXTRA, or set COREEDGE_ENV_TENANT_HOSTS=observe.";

/**
 * Open a console call for a person a route's own gate has let through. Call
 * the steps in order: `authorise`, `bind`, `contain`, then `callSap`.
 */
export function openConsoleCall(input: ConsoleCallInput): ConsoleCall {
  return new ConsoleCall(input);
}

export class ConsoleCall {
  readonly principal = CONSOLE_PRINCIPAL;
  /** Quoted back to the person; on both rows of the call. */
  readonly correlationId: string = newCorrelationId();
  private readonly mode: "read" | "write";
  private authorised = false;
  private bound = false;
  private permit: CircuitPermit | null = null;
  private hostCheck: HostCheck | null = null;

  constructor(private readonly input: ConsoleCallInput) {
    this.mode = input.mode ?? "read";
  }

  /** The stored connection the call reaches, or null for a deployment tenant and for Ariba. */
  get connection(): ResolvedReadTenant["connection"] {
    return this.input.target.kind === "odata" ? this.input.target.resolved.connection : null;
  }

  /* ── authorise ──────────────────────────────────────────────────────── */

  /**
   * The console's ceilings. A sandbox developer reads SANDBOX systems only,
   * the deployment tenant included (P0.13) — and an Ariba realm declares no
   * landscape, so it is never one. Then, for a stored connection, the
   * environment ceiling: Sandbox and Dev freely, TEST, PROD or undeclared only
   * under a live grant. A deployment tenant has no organization and so no
   * grant that could be written for it; it is still audited.
   */
  async authorise(): Promise<StepResult<void>> {
    const { viewer, target } = this.input;
    const tenant = target.kind === "odata" ? target.resolved.tenant : {};
    const conn = this.connection;
    const sandboxOnly = decideSandboxDeveloperRead(viewer.role, { tenant, connection: conn });
    if (!sandboxOnly.allowed) return this.refuse(refusal("authorise", "SANDBOX_ONLY", sandboxOnly.message ?? ""));
    // A connection implies an organization (resolveReadTenant looks one up
    // only within it); naming both keeps the grant query on a real id.
    if (conn && viewer.organizationId) {
      const decision = await decideConsoleRead({ organizationId: viewer.organizationId, environment: conn.environment });
      if (!decision.allowed) {
        return this.refuse(refusal("authorise", decision.refusal ?? "NO_APPROVED_GRANT", decision.message ?? ""));
      }
    }
    this.authorised = true;
    return passed();
  }

  /* ── bindConnection ─────────────────────────────────────────────────── */

  /**
   * The hosts the call is sent to, for a deployment tenant and for Ariba,
   * against the allow-list a stored connection passed when it was saved.
   * Observes unless COREEDGE_ENV_TENANT_HOSTS=enforce (env-tenant-hosts.ts).
   */
  async bind(): Promise<StepResult<void>> {
    if (!this.authorised) throw new ConsolePipelineError("bind() before authorise()");
    const mode = envTenantHostMode();
    const { target } = this.input;
    const urls =
      target.kind === "ariba"
        ? aribaUrls()
        : target.resolved.source === "deployment"
          ? deploymentTenantUrls(target.product.envPrefix, target.resolved.tenant)
          : null;
    if (mode !== "off" && urls) {
      this.hostCheck = checkConfiguredUrls(urls);
      if (!this.hostCheck.allowed) {
        warnUnlistedHosts(this.hostCheck, mode, this.correlationId);
        if (mode === "enforce") {
          return this.refuse(
            refusal("bindConnection", "HOST_NOT_ALLOWED", hostRefusalMessage, {
              audit: { failureReason: FAILURE_REASON_HOST_NOT_ALLOWED },
            }),
          );
        }
      }
    }
    this.bound = true;
    return passed();
  }

  /* ── contain ────────────────────────────────────────────────────────── */

  /**
   * The console's circuit for this system, inside this organization's console
   * scope — never the circuit the northbound routes use, and never another
   * organization's (containment.ts circuitKeyForConsoleRead).
   */
  async contain(): Promise<StepResult<void>> {
    if (!this.bound) throw new ConsolePipelineError("contain() before bind()");
    if (this.mode === "write") throw new ConsolePipelineError("a write-back takes no console circuit");
    const { viewer, target } = this.input;
    const system =
      target.kind === "ariba"
        ? circuitKeyForDeploymentTenant("ARIBA", target.realm || "-")
        : target.resolved.connection
          ? circuitKeyForConnection(target.resolved.connection.id)
          : circuitKeyForDeploymentTenant(target.product.envPrefix, target.resolved.tenant.key);
    const circuit = await containKey(
      circuitKeyForConsoleRead(viewer.organizationId ?? DEPLOYMENT_AUDIT_SCOPE, system),
      this.correlationId,
    );
    if (!circuit.ok) return this.refuse(circuit.refusal);
    this.permit = circuit.value;
    return passed();
  }

  /* ── callSap + audit ────────────────────────────────────────────────── */

  /**
   * The call to SAP, timed around `fn` alone, its outcome told to the circuit
   * and audited on both trails. `describe` says what the answer (or the
   * failure) is recorded as. Never throws what `fn` threw: it comes back as
   * `{ ok: false, error }`, after it is recorded, for the route to answer.
   */
  async callSap<T>(
    fn: () => Promise<T>,
    describe: {
      readonly answered: (value: T) => ConsoleOutcome;
      readonly failed: (error: unknown) => ConsoleOutcome;
    },
  ): Promise<ConsoleSapResult<T>> {
    if (this.mode !== "read") throw new ConsolePipelineError("callSap() on a write-back: use callSapWrite()");
    if (!this.authorised || !this.bound || !this.permit) {
      throw new ConsolePipelineError("callSap() before authorise(), bind() and contain() passed");
    }
    const permit = this.permit;
    const startedAt = Date.now();
    let result: ConsoleSapResult<T>;
    let outcome: ConsoleOutcome;
    try {
      const value = await fn();
      result = { ok: true, value, durationMs: Date.now() - startedAt };
      outcome = describe.answered(value);
    } catch (error) {
      result = { ok: false, error, durationMs: Date.now() - startedAt };
      outcome = describe.failed(error);
    }
    await permit.record(circuitOutcomeForConsoleRead(outcome.status, outcome.sapStatus ?? null));
    await this.record(outcome, { durationMs: result.durationMs, blocked: null });
    return result;
  }

  /**
   * The write-back's call. Takes the handle of the row P0.7's fail-closed
   * `beginPlatformAudit` wrote, so it cannot run before that row exists; the
   * route records the outcome with `completePlatformAudit`.
   */
  async callSapWrite<T>(handle: PlatformAuditHandle, fn: () => Promise<T>): Promise<T> {
    if (this.mode !== "write") throw new ConsolePipelineError("callSapWrite() on a read: use callSap()");
    if (!this.authorised || !this.bound) throw new ConsolePipelineError("callSapWrite() before authorise() and bind() passed");
    if (!handle?.id) throw new ConsolePipelineError("callSapWrite() without the write's audit row");
    return fn();
  }

  /** A step's refusal: recorded on both trails (a read), then handed back for the route to answer. */
  private async refuse(r: Refusal): Promise<StepResult<void>> {
    if (this.mode === "read") {
      await this.record(
        { status: r.status, rowCount: null, ...(r.audit.failureReason === undefined ? {} : { failureReason: r.audit.failureReason }) },
        { durationMs: null, blocked: r },
      );
    }
    return { ok: false, refusal: r };
  }

  private async record(
    outcome: ConsoleOutcome,
    how: { readonly durationMs: number | null; readonly blocked: Refusal | null },
  ): Promise<void> {
    const { viewer, target } = this.input;
    const externalId = outcome.externalId ?? this.input.externalId;
    const conn = this.connection;
    const environment =
      target.kind === "odata" ? (conn?.environment ?? `deployment:${target.resolved.tenant.key}`) : "ariba";
    if (target.kind === "odata") {
      // The organization's console row, exactly as recordConsoleRead has
      // always been called: the deployment tenant of a reader with no
      // organization is filed under DEPLOYMENT_AUDIT_SCOPE.
      await recordConsoleRead({
        organizationId: viewer.organizationId ?? DEPLOYMENT_AUDIT_SCOPE,
        actorUserId: viewer.id,
        externalId,
        environment,
        status: outcome.status,
        rowCount: outcome.rowCount,
        correlationId: this.correlationId,
        connectionId: conn?.id ?? null,
        connectionEnvironment: conn?.environment ?? null,
        ...(how.durationMs === null ? {} : { durationMs: how.durationMs }),
        ...(outcome.failureReason === undefined ? {} : { failureReason: outcome.failureReason }),
      });
    }
    const kind: ConsoleReadOutcomeKind = consoleReadOutcome(outcome.status, how.blocked !== null);
    await recordPlatformConsoleRead({
      actor: {
        id: viewer.id,
        email: viewer.email ?? "",
        role: viewer.role,
        organizationId: viewer.organizationId ?? null,
      },
      target: {
        product: target.kind === "odata" ? target.product.key : "ariba",
        tenantKey: target.kind === "odata" ? target.resolved.tenant.key : target.realm || "-",
        tenantLabel: target.kind === "odata" ? target.resolved.tenant.label : null,
        serviceKey: externalId,
        servicePath: this.input.servicePath ?? null,
        entitySet: this.input.entitySet || "-",
      },
      request: this.input.request ?? {},
      correlationId: this.correlationId,
      outcome: kind,
      status: how.blocked ? null : outcome.status,
      reason: how.blocked ? how.blocked.reason : (outcome.failureReason ?? null),
      durationMs: how.durationMs,
      detail: {
        principal: CONSOLE_PRINCIPAL,
        route: this.input.route,
        meaning: CONSOLE_READ_OUTCOMES[kind],
        source: target.kind === "ariba" ? "ariba" : target.resolved.source,
        // Where the organization's row for this call is filed, when there is one.
        organizationScope: target.kind === "odata" ? (viewer.organizationId ?? DEPLOYMENT_AUDIT_SCOPE) : null,
        connectionId: conn?.id ?? null,
        environment,
        status: outcome.status,
        rowCount: outcome.rowCount,
        ...(how.blocked ? { step: how.blocked.step } : {}),
        hostCheck: this.hostCheck === null ? "not-checked" : this.hostCheck.allowed ? "allowed" : "unlisted",
        ...(this.hostCheck && !this.hostCheck.allowed
          ? { unlistedHosts: this.hostCheck.findings.map((f) => ({ variable: f.variable, host: f.host })) }
          : {}),
      },
    });
  }
}

/** The JSON a console route answers a step's refusal with: its code, its sentence, the correlation id. */
export function consoleRefusalBody(r: Refusal, correlationId: string): { error: { code: string; message: string; correlationId: string } } {
  return { error: { code: r.code, message: r.message, correlationId } };
}

/** The response init for a refusal: its status, and its headers (Retry-After on an open circuit). */
export function consoleRefusalInit(r: Refusal): { status: number; headers?: Record<string, string> } {
  return { status: r.status, ...(Object.keys(r.headers).length ? { headers: { ...r.headers } } : {}) };
}
