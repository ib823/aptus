/**
 * Config-change audit for Developer Studio.
 *
 * Guardrail: EVERY governance mutation writes who / what / when / before→after,
 * from day one. This is the habit the per-call northbound audit will extend, and
 * it is the only record of how a solution came to be allowed to touch a client's
 * SAP tenant.
 *
 * APPEND-ONLY BY CONSTRUCTION: this module exposes writes and nothing else.
 * There is deliberately no update or delete helper — an audit trail that can be
 * edited is not an audit trail. (`ConfigAudit` rows are removed only by the
 * Organization cascade, when the tenant itself is deleted.)
 */

import { prisma } from "@/lib/db/prisma";

export type AuditEntityType =
  | "Solution"
  | "Interface"
  | "ApiAccessGrant"
  | "TestCase"
  /**
   * A runtime credential — its own entity, because it used to be filed under
   * the parent Solution with action UPDATE. Minting a live SAP token was
   * therefore indistinguishable from renaming a record, and the governance
   * question "what did this person issue, so it can be found and revoked" had
   * no field to filter on.
   */
  | "ClientCredential"
  | "Connection"
  /**
   * A governance action admitted without a fresh passkey step-up, under
   * COREEDGE_STEP_UP=warn (lib/auth/step-up.ts), when the route had no row to
   * name yet (a first connection, a passkey being added). `entityId` is then
   * the action's name (e.g. "passkey.add"). When there IS a row, the
   * STEP_UP_MISSING entry is filed under that row's own type and id instead,
   * beside the entries the action itself writes.
   */
  | "StepUp"
  /**
   * A passkey added (CREATE) to or removed (REVOKE) from a person's account
   * (lib/auth/passkey-events.ts). `entityId` is the WebAuthn credential id.
   * The step-up trusts every passkey a person has, so the set is itself
   * governed: a first passkey needs only the session, and this row is how an
   * enrolment nobody expected is found.
   */
  | "Passkey"
  /**
   * An account administered by a platform admin (/api/admin/users): created
   * with a role that can act on governance, given a new role, or its passkeys
   * reset. `entityId` is the user id. Recorded for a missing step-up.
   */
  | "User";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "PROMOTE"
  | "DECISION"
  | "TEST_CONNECT"
  /** A credential minted where none existed. */
  | "ISSUE"
  /**
   * A credential minted OVER a live one. Distinct from ISSUE on purpose: because
   * issuance upserts, the second call invalidates the token in production, and a
   * trail that called both "ISSUE" would hide the outage inside the routine case.
   */
  | "ROTATE"
  /**
   * A credential deliberately ended. The verbs above were added so minting was
   * enumerable; revocation stayed `Solution/UPDATE` — so the trail could say
   * what was issued but not what was stopped, and "which credentials did this
   * person kill" had no field to filter on.
   */
  | "REVOKE"
  /**
   * The per-solution WRITE key minted. Its own verb, not ISSUE: a write key is
   * the second secret that lets a solution CREATE records in a customer's SAP
   * ledger, and folding it into the read-token verb would hide the single most
   * consequential issuance the product performs inside the routine one.
   */
  | "ISSUE_WRITE"
  /**
   * A governance action went ahead with no passkey assertion inside the
   * step-up window. Recorded only in warn mode; enforce refuses instead.
   */
  | "STEP_UP_MISSING";

export interface ConfigAuditInput {
  organizationId: string;
  actorId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  /** State before the change — omit for CREATE. */
  before?: unknown;
  /** State after the change. */
  after?: unknown;
}

/**
 * Record a governance change.
 *
 * Best-effort by design: a failure to write the audit row must not roll back or
 * fail the user's action, but it must be loud in the logs. Losing the change
 * itself because the audit write failed would be a worse outcome than a gap in
 * the trail — and the gap is at least visible.
 */
export async function writeConfigAudit(input: ConfigAuditInput): Promise<void> {
  try {
    await prisma.configAudit.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        // `undefined` would omit the column; Prisma.JsonNull is not needed here
        // because both columns are nullable and we simply skip absent sides.
        ...(input.before === undefined ? {} : { before: input.before as never }),
        ...(input.after === undefined ? {} : { after: input.after as never }),
      },
    });
  } catch (err) {
    console.error("[studio-audit] failed to write ConfigAudit entry", {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      err,
    });
  }
}

export type PlatformGovernanceAuditInput = Omit<ConfigAuditInput, "organizationId" | "before">;

/**
 * Record a governance event that has NO TENANT to file it under.
 *
 * A platform admin, or an account an admin created with no organization, has
 * no ConfigAudit trail: those rows belong to an organization. These are the
 * most privileged accounts there are, and their passkey and step-up events
 * used to reach only the log, including the trust-on-first-use enrolment the
 * step-up relies on being visible. PlatformGovernanceAudit is the same append-only
 * record minus the tenant. Callers with an organization use
 * `writeConfigAudit`. Best-effort, exactly like it.
 *
 * Not for writes to SAP: those must use the fail-closed
 * `beginPlatformAudit`/`completePlatformAudit` pair in lib/audit/platform-audit.ts,
 * which records into `PlatformAuditEvent`/`PlatformAuditOutcome`.
 */
export async function writePlatformGovernanceAudit(input: PlatformGovernanceAuditInput): Promise<void> {
  try {
    await prisma.platformGovernanceAudit.create({
      data: {
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        ...(input.after === undefined ? {} : { after: input.after as never }),
      },
    });
  } catch (err) {
    console.error("[studio-audit] failed to write PlatformGovernanceAudit entry", {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      err,
    });
  }
}
