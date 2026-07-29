/**
 * Config-change audit for Developer Studio.
 *
 * Guardrail: EVERY governance mutation writes who / what / when / before→after,
 * from day one. This is the habit the per-call northbound audit will extend, and
 * it is the only record of how a solution came to be allowed to touch a client's
 * SAP tenant.
 *
 * APPEND-ONLY BY CONSTRUCTION: this module exposes a write and nothing else.
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
  | "Connection";

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
  | "ROTATE";

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
