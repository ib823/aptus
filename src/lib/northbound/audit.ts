/**
 * Per-call audit for the northbound broker.
 *
 * Every call to a client's SAP system leaves a row: which solution, which
 * interface, what came back, and — crucially — WHICH TOKEN was used. That last
 * field is what makes a leaked credential actionable: you can see exactly what
 * it touched and revoke precisely it, rather than rotating everything and hoping.
 *
 * APPEND-ONLY BY CONSTRUCTION: this module exposes a write and nothing else.
 * There is deliberately no update or delete helper, because an audit trail that
 * can be edited is not an audit trail.
 *
 * Failures are FAILURES too. A 403 or a timeout is recorded exactly like a
 * success — an audit that only shows the calls that worked would hide the very
 * pattern (repeated denials from one token) that indicates something is wrong.
 */

import { prisma } from "@/lib/db/prisma";

export interface NorthboundAuditInput {
  organizationId: string;
  solutionId: string;
  interfaceId: string | null;
  operation: "READ" | "WRITE";
  externalId: string;
  environment: string;
  /** The HTTP status returned to the CALLER — what actually happened. */
  status: number;
  rowCount: number | null;
  correlationId: string;
  clientTokenId: string;
  /**
   * Which SapConnection served the call, and the landscape that row declared.
   *
   * `environment` above is the CREDENTIAL's declared environment; these are the
   * CONNECTION's. Both are recorded because only the pair can show they agreed —
   * before the binding fix the broker could serve a PROD connection while the
   * audit row sincerely said "SANDBOX", and nothing in the trail could reveal it.
   *
   * Null on calls that never reached a connection (refused at auth, throttle, or
   * the grant gate). `connectionEnvironment` null on a SERVED read means the
   * binding was permitted but unverified — the connection had declared no
   * landscape.
   */
  connectionId?: string | null;
  connectionEnvironment?: string | null;
}

export async function recordNorthboundCall(input: NorthboundAuditInput): Promise<void> {
  try {
    await prisma.northboundAuditEvent.create({
      data: {
        organizationId: input.organizationId,
        solutionId: input.solutionId,
        interfaceId: input.interfaceId,
        operation: input.operation,
        externalId: input.externalId,
        environment: input.environment,
        status: input.status,
        rowCount: input.rowCount,
        correlationId: input.correlationId,
        clientTokenId: input.clientTokenId,
        connectionId: input.connectionId ?? null,
        connectionEnvironment: input.connectionEnvironment ?? null,
      },
    });
  } catch (err) {
    // Loud, but never fatal: losing the caller's data because the audit row
    // failed would be a worse outcome than a visible gap in the trail.
    console.error("[northbound-audit] failed to record call", {
      correlationId: input.correlationId,
      clientTokenId: input.clientTokenId,
      err,
    });
  }
}
