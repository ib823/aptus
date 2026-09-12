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
import { newCorrelationId } from "@/lib/northbound/respond";
import { allowsUngrantedRead, type SapEnvironment } from "@/lib/sap-public/environment";
import { grantsRead, type GrantDecision, type GrantEnvironment } from "@/lib/studio/grants";

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
  | "UNDECLARED_ENVIRONMENT";

export interface ConsoleReadDecision {
  allowed: boolean;
  refusal: ConsoleReadRefusal | null;
  /** Safe, actionable sentence for the caller. Never names a host or another org. */
  message: string | null;
}

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
  }
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
}): Promise<ConsoleReadDecision> {
  const { organizationId, environment } = input;
  const now = input.now ?? new Date();

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
  const grants = await prisma.apiAccessGrant.findMany({
    where: { organizationId, environment },
    select: { decision: true, expiresAt: true, revokedAt: true },
  });

  const live = grants.some(
    (g) =>
      grantsRead(g.decision as GrantDecision, environment as GrantEnvironment) &&
      // `== null` matches null and undefined alike, exactly as access.ts does.
      g.revokedAt == null &&
      (g.expiresAt === null || g.expiresAt.getTime() > now.getTime()),
  );

  if (live) return { allowed: true, refusal: null, message: null };

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
