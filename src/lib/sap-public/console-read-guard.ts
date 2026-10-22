/**
 * Who may cause a CONSOLE read of a customer's SAP tenant, and the row that proves it happened.
 *
 * THE GAP THIS CLOSES (audit E15). `/api/sap/tdd/preview`, `/entities` and
 * `/operations` open a live connection to a client's SAP system and issue real
 * OData requests against it. `refuseUnlessMayProbeTenant` established WHO may do
 * that — a Studio role, not merely a session — and stopped there. Three things
 * were still missing, and the broker's own comment named all three when the Test
 * Console was moved off these routes: "role-gated env-tenant reads with no grant
 * check, no environment binding, and no northbound audit row"
 * (api/studio/test/broker-run/route.ts).
 *
 * So this module adds the two that remain:
 *
 *   1. AN ENVIRONMENT CEILING, OR A GRANT. A console read may reach a SANDBOX or
 *      DEV system freely — that is the builder's job and the whole point of a
 *      discovery console. Anything beyond that (TEST, PROD, or a system that has
 *      not declared its landscape) needs a live, approved, unrevoked, unexpired
 *      `ApiAccessGrant` for that environment, exactly as a deployed application
 *      would. A human clicking Preview and a machine calling the broker now face
 *      the same question about a client's production data.
 *
 *   2. AN AUDIT ROW, ALWAYS, INCLUDING THE FAN-OUT. `?probe=1` on /entities is
 *      not one read, it is one read per entity set the service exposes — the
 *      single most amplifying thing a console can do to a tenant, and the thing
 *      that previously left no trace at all. Every read records a
 *      `NorthboundAuditEvent` with `dryRun: true` and `actorUserId` set.
 *
 * WHY dryRun: true. The column means "real traffic on a real system, initiated
 * from a console rather than by a deployed application" — which is exactly what
 * these are. The Test Console's broker dry run already sets it for the same
 * reason, so the operations board's existing filter separates console-initiated
 * traffic from application traffic without learning a second concept.
 *
 * WHY THE DEPLOYMENT TENANT IS EXEMPT FROM THE GRANT GATE. A tenant configured
 * through `{PREFIX}_*` env vars is the deployment's own demo system, not a
 * customer's: no organization owns it, so there is no grant that could ever be
 * written for it and requiring one would close the catalogue to everybody. It is
 * still audited, and it is still behind the role gate.
 */

import { prisma } from "@/lib/db/prisma";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import { solutionRefusal, type SolutionRefusal } from "@/lib/northbound/authorisation";
import { newCorrelationId } from "@/lib/northbound/respond";
import { allowsUngrantedRead, parseSapEnvironment, type SapEnvironment } from "@/lib/sap-public/environment";
import { grantBindingMode, type GrantBindingMode } from "@/lib/studio/grant-binding";
import { grantsRead, type GrantDecision, type GrantEnvironment } from "@/lib/studio/grants";
import { isSandboxDeveloper } from "@/lib/studio/rbac";

/**
 * The organization a console read is recorded under when the reader has none.
 *
 * A `platform_admin` may legitimately carry a null `organizationId` — `ops/guard.ts`
 * models that explicitly as the "global" actor — and such a reader can still reach
 * the DEPLOYMENT's own `{PREFIX}_*` tenant, which belongs to no organization
 * either. The read is real and must be recorded, and there is no tenant to record
 * it under.
 *
 * A SENTINEL RATHER THAN AN EMPTY STRING, which is what the first version of this
 * wrote. `""` is a value that looks like a tenant id to every query that reads
 * this table, sorts beside real ones, and says nothing to whoever finds it. This
 * says what it is, matches the `-discovery-` / `-schema-` convention the
 * northbound routes already use for "there is no real value here", and is
 * greppable.
 *
 * It can only ever appear on a deployment-tenant read: a stored connection
 * belongs to an organization by construction, and `resolveReadTenant` will not
 * return one for a caller with no organization.
 */
export const DEPLOYMENT_AUDIT_SCOPE = "-deployment-";

/** Why a console read was refused, or null when it was permitted. */
export type ConsoleReadRefusal =
  /** The system declares TEST/PROD (or nothing) and no live grant covers it. */
  | "NO_APPROVED_GRANT"
  /** The system has not declared its landscape, so no ceiling can be applied. */
  | "UNDECLARED_ENVIRONMENT"
  /** A sandbox developer (P0.13) reading anything but a SANDBOX system. */
  | "SANDBOX_ONLY";

export interface ConsoleReadDecision {
  allowed: boolean;
  refusal: ConsoleReadRefusal | null;
  /** Safe, actionable sentence for the caller. Never names a host or another org. */
  message: string | null;
  /**
   * Allowed only on a grant the broker's own rules no longer honour, under
   * `COREEDGE_CONSOLE_GRANTS=observe` (the default): why enforce would refuse
   * the read (`consoleCeilingSetAside`). The console logs it and records it
   * on the platform row (governed/console.ts).
   */
  observed?: ConsoleCeilingSetAside;
}

/**
 * WHICH GRANTS OPEN THE CONSOLE (wave 2 integration review round 3).
 *
 * The ceiling asks "is this organization cleared for this landscape at all",
 * deliberately coarser than the broker on WHICH service (see
 * decideConsoleRead). It is not meant to be coarser on WHETHER a grant still
 * counts: a grant whose app is RETIRED, or an unbound legacy grant once
 * COREEDGE_GRANT_BINDING=strict, authorises nothing at the broker, the lane
 * board or discovery (authorisation.ts `solutionRefusal`, grant-binding.ts
 * `isUsableUnder`), and kept opening PROD reads here.
 *
 * Counting only those grants is a new refusal on a console read that works
 * today, so it is a setting (docs/runbooks/coreedge-governed-pipeline.md):
 *
 *   COREEDGE_CONSOLE_GRANTS=observe (default) — the ceiling answers as before;
 *     a read that only such a grant opens is allowed, logged and recorded as
 *     what enforce would refuse.
 *   COREEDGE_CONSOLE_GRANTS=enforce — such a grant does not count.
 */
export type ConsoleGrantMode = "observe" | "enforce";

export function consoleGrantMode(env: Record<string, string | undefined> = process.env): ConsoleGrantMode {
  return env.COREEDGE_CONSOLE_GRANTS?.trim().toLowerCase() === "enforce" ? "enforce" : "observe";
}

/** Why the shared rules no longer honour a live grant. */
export type ConsoleCeilingSetAside = SolutionRefusal | "GRANT_NEEDS_REAPPROVAL";

/** The grant columns the ceiling judges. */
export interface CeilingGrant {
  readonly decision: string;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  /**
   * The interface the grant is bound to, or null for a legacy unbound one.
   * Absent reads as unbound, as grant-binding.ts `isBoundTo` reads a row
   * that did not select it: the safe reading under strict.
   */
  readonly interfaceId?: string | null;
  /** The owning app's status; null when it is gone. Absent reads as gone. */
  readonly solutionStatus?: string | null;
}

/**
 * Does the broker's rule set still honour this grant at all, whatever the
 * service? Its app is not RETIRED (or gone), and under strict grant binding
 * it is bound to an interface. Null when it does.
 */
export function consoleCeilingSetAside(
  grant: CeilingGrant,
  bindingMode: GrantBindingMode = grantBindingMode(),
): ConsoleCeilingSetAside | null {
  const app = solutionRefusal(grant.solutionStatus ?? null);
  if (app !== null) return app;
  if (bindingMode === "strict" && (grant.interfaceId ?? null) === null) return "GRANT_NEEDS_REAPPROVAL";
  return null;
}

const SET_ASIDE_SENTENCE: Readonly<Record<ConsoleCeilingSetAside, string>> = {
  SOLUTION_RETIRED: "The only approval for it belongs to an app that has been retired, which authorises nothing.",
  SOLUTION_MISSING: "The only approval for it belongs to an app that no longer exists.",
  GRANT_NEEDS_REAPPROVAL:
    "The only approval for it is a legacy one that is not bound to an interface, which this deployment no longer honours: ask for it to be approved again.",
};

/**
 * The message for each refusal.
 *
 * Kept beside the enum for the same reason `connectionRefusalMessage` is: adding
 * a refusal should force you to say what it means to the person whose read just
 * failed. Neither sentence names the system's host or another organization —
 * the caller learns what THEY must do.
 */
export function consoleReadRefusalMessage(
  refusal: ConsoleReadRefusal,
  environment: SapEnvironment | null,
): string {
  switch (refusal) {
    case "NO_APPROVED_GRANT":
      return (
        `This SAP system is declared ${environment ?? "(undeclared)"}. Reading it from the console ` +
        `needs an approved access grant for ${environment ?? "that environment"}, the same one a ` +
        `deployed application would need. Sandbox and Dev systems can be read without one — ` +
        `request access under API Access, or point this read at a Dev system.`
      );
    case "UNDECLARED_ENVIRONMENT":
      return (
        "This SAP system has not declared which environment it is, so the console cannot tell " +
        "whether reading it is safe. Set the environment on the connection in Studio — a system " +
        "that might be production is treated as production."
      );
    case "SANDBOX_ONLY":
      return (
        `A developer workspace reads Sandbox systems only, such as the SAP API Hub sandbox this ` +
        `host provides. This system is declared ${environment ?? "(undeclared)"}. Pick a Sandbox ` +
        `tenant, or ask an administrator of your organization for a role that can request access.`
      );
  }
}

/**
 * The sandbox developer's ceiling (roadmap P0.13): SANDBOX, and nothing above it.
 *
 * WIDER THAN `decideConsoleRead` IN ONE RESPECT, ON PURPOSE. That guard exempts
 * the deployment's own `{PREFIX}_*` tenant, because no organization owns it and
 * a builder exploring it needs no grant. A sandbox developer is whoever signed
 * up on the shared host, so the deployment tenant is exactly what must be
 * capped for them: on a host whose env tenant is a real S/4HANA system, an open
 * sign-up must not become a live read of it. The tenant counts as SANDBOX only
 * when it says so (`environment: "SANDBOX"` in `*_TENANTS_JSON`, or
 * `*_TENANT_ENVIRONMENT`); undeclared is refused, as it is everywhere else.
 *
 * Every other role is answered `allowed` here and keeps its own rules.
 */
export function decideSandboxDeveloperRead(
  role: string | null | undefined,
  read: {
    readonly tenant: { readonly environment?: string };
    readonly connection: { readonly environment: SapEnvironment | null } | null;
  },
): ConsoleReadDecision {
  if (!isSandboxDeveloper(role)) return { allowed: true, refusal: null, message: null };
  const environment = read.connection
    ? read.connection.environment
    : parseSapEnvironment(read.tenant.environment);
  if (environment === "SANDBOX") return { allowed: true, refusal: null, message: null };
  return {
    allowed: false,
    refusal: "SANDBOX_ONLY",
    message: consoleReadRefusalMessage("SANDBOX_ONLY", environment),
  };
}

/**
 * May this organization read this connection-backed system from a console?
 *
 * `environment` is the CONNECTION's declared landscape. Null — undeclared — is
 * refused rather than permitted: the ceiling is "Sandbox and Dev are free", and a
 * system that will not say which it is cannot be shown to be under the ceiling.
 * That is the same direction the write path already takes with
 * `UNDECLARED_ENVIRONMENT_WRITE`, and the opposite of the read path's
 * `bindingUnverified`, deliberately: the broker read has a grant behind it and
 * this one, by construction, may not.
 */
export async function decideConsoleRead(input: {
  organizationId: string;
  environment: SapEnvironment | null;
  now?: Date;
  /**
   * The organization's grants for `environment`, when they were read already
   * in the connection's own statement (governed/call-loads.ts
   * loadConsoleConnection, P0.14b review round 5): judged here exactly as the
   * rows this function would have read, and not read again.
   */
  grants?: readonly CeilingGrant[];
  /** Defaults to the deployment's settings (consoleGrantMode, grantBindingMode). */
  mode?: ConsoleGrantMode;
  bindingMode?: GrantBindingMode;
}): Promise<ConsoleReadDecision> {
  const { organizationId, environment } = input;
  const now = input.now ?? new Date();
  const mode = input.mode ?? consoleGrantMode();
  const bindingMode = input.bindingMode ?? grantBindingMode();

  if (allowsUngrantedRead(environment)) {
    return { allowed: true, refusal: null, message: null };
  }

  if (environment === null) {
    return {
      allowed: false,
      refusal: "UNDECLARED_ENVIRONMENT",
      message: consoleReadRefusalMessage("UNDECLARED_ENVIRONMENT", environment),
    };
  }

  /*
   * ANY live grant for this environment, in this organization, opens the console
   * for it — not a grant for one particular service.
   *
   * This is deliberately coarser than the broker's own check, and it is the
   * looser of the two on purpose: the broker is answering "may this solution read
   * THIS service", which is a runtime authorisation for a named capability. The
   * console is answering "is this organization cleared to look at this landscape
   * at all", which is what a discovery surface needs in order to be usable —
   * requiring a per-service grant before you can discover which services exist
   * would be a circular gate. What it is NOT is a bypass: an organization with no
   * approved TEST or PROD access cannot reach a TEST or PROD system from here,
   * which is the exposure the audit recorded.
   *
   * The predicate is `grantsRead`, the same function the data route enforces
   * with — not `isGranting`, which is display-only and disagrees on SANDBOX_ONLY
   * outside SANDBOX. The northbound discovery route has been wrong on exactly
   * this twice; one function, one answer.
   */
  const grants: readonly CeilingGrant[] =
    input.grants ??
    (
      await prisma.apiAccessGrant.findMany({
        where: { organizationId, environment },
        select: {
          decision: true,
          expiresAt: true,
          revokedAt: true,
          interfaceId: true,
          solution: { select: { status: true, organizationId: true } },
        },
      })
    ).map((g) => ({
      decision: g.decision,
      expiresAt: g.expiresAt,
      revokedAt: g.revokedAt,
      interfaceId: g.interfaceId,
      // The grant's app in this organization, as the console load reads it.
      solutionStatus: g.solution?.organizationId === organizationId ? g.solution.status : null,
    }));

  const live = grants.filter(
    (g) =>
      grantsRead(g.decision as GrantDecision, environment as GrantEnvironment) &&
      // `== null` matches null and undefined alike, exactly as access.ts does.
      g.revokedAt == null &&
      (g.expiresAt === null || g.expiresAt.getTime() > now.getTime()),
  );

  // Only grants the broker's rules still honour count (consoleCeilingSetAside).
  const setAside = live.map((g) => consoleCeilingSetAside(g, bindingMode));
  if (setAside.some((reason) => reason === null)) return { allowed: true, refusal: null, message: null };
  const observed = setAside[0];
  if (observed !== undefined && observed !== null) {
    if (mode === "observe") return { allowed: true, refusal: null, message: null, observed };
    return {
      allowed: false,
      refusal: "NO_APPROVED_GRANT",
      message: `${consoleReadRefusalMessage("NO_APPROVED_GRANT", environment)} ${SET_ASIDE_SENTENCE[observed]}`,
    };
  }

  return {
    allowed: false,
    refusal: "NO_APPROVED_GRANT",
    message: consoleReadRefusalMessage("NO_APPROVED_GRANT", environment),
  };
}

/** What a console read is recorded as. `externalId` is the service or probe scope. */
export interface ConsoleReadRecord {
  organizationId: string;
  actorUserId: string;
  /** The catalogue service reached, or a `-…-` scope sentinel for a fan-out. */
  externalId: string;
  /** The connection's declared landscape, or the deployment tenant's key. */
  environment: string;
  status: number;
  /**
   * How many records came back, or — for a fan-out — how many probes were made.
   * Null when the read never happened (a refusal before any request left).
   */
  rowCount: number | null;
  correlationId: string;
  connectionId?: string | null;
  connectionEnvironment?: string | null;
  durationMs?: number | null;
  failureReason?: string | null;
}

/**
 * Record one console read.
 *
 * `solutionId` and `clientTokenId` are null and `actorUserId` carries the person:
 * a console read is authorised by a human's role, not by a credential, and the
 * row says so rather than borrowing a solution that was not involved.
 */
export async function recordConsoleRead(record: ConsoleReadRecord): Promise<void> {
  await recordNorthboundCall({
    organizationId: record.organizationId,
    solutionId: null,
    interfaceId: null,
    operation: "READ",
    externalId: record.externalId,
    environment: record.environment,
    status: record.status,
    rowCount: record.rowCount,
    correlationId: record.correlationId,
    clientTokenId: null,
    actorUserId: record.actorUserId,
    dryRun: true,
    connectionId: record.connectionId ?? null,
    connectionEnvironment: record.connectionEnvironment ?? null,
    durationMs: record.durationMs ?? null,
    failureReason: record.failureReason ?? null,
  });
}

export { newCorrelationId };
