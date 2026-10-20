/**
 * The organization's active SAP connections as they stand now — metadata only
 * (id, product, declared environment, SAP client, host), never a secret.
 *
 * What a stored service verification is compared against
 * (service-verifications.ts entryMatchesConnection): an admin who edits a
 * connection's host or client keeps its id, and the write gate then refuses
 * every write the old verification seemed to allow. The Interfaces screen and
 * the activation gate read the same list, so neither calls an environment
 * open that the broker would refuse.
 *
 * SERVER-ONLY (prisma).
 */

import { prisma } from "@/lib/db/prisma";
import { normalizeEnvironment, selectConnectionForEnvironment } from "@/lib/sap-public/connection-resolver";
import {
  entryMatchesConnection,
  isVerifiedForBinding,
  parseServiceVerifications,
  trimTrailingSlashes,
  type CurrentConnection,
} from "@/lib/sap-public/service-verifications";

export interface CurrentProductConnection extends CurrentConnection {
  product: string;
}

export function toCurrentConnection(row: {
  id: string;
  product: string;
  environment: string | null;
  client: string | null;
  baseUrl: string;
}): CurrentProductConnection {
  return {
    id: row.id,
    product: row.product,
    environment: normalizeEnvironment(row.environment),
    client: row.client ?? null,
    baseUrl: row.baseUrl,
  };
}

export async function loadCurrentConnections(
  organizationId: string,
  product?: string,
): Promise<CurrentProductConnection[]> {
  const rows = await prisma.sapConnection.findMany({
    where: { organizationId, isActive: true, ...(product ? { product } : {}) },
    select: { id: true, product: true, environment: true, client: true, baseUrl: true },
  });
  return rows.map(toCurrentConnection);
}

/**
 * The environments in which a WRITE by one of these credentials would pass the
 * write route's verification gate — the same question that gate asks, asked
 * before the call.
 *
 * WHY PER CREDENTIAL, NOT PER ENVIRONMENT. A write binds by environment AND
 * the credential's SAP client (resolveSapConnectionForEnvironment), and the
 * gate then wants a verification for exactly that binding. Asking "does PROD
 * hold any current verification" let a verify of PROD client 100 mark PROD
 * ready while the solution's PROD credential is bound to client 200: the
 * interface went ACTIVE, the screen said ready, and every write was refused
 * (review round 3). So, for each live credential, run the write route's own
 * selection over the current connections and count its environment only when
 * that selected binding is the one that answered a verify. A credential whose
 * selection fails (no connection, ambiguous, undeclared) counts nowhere — its
 * writes are refused before the gate anyway.
 *
 * AN ENVIRONMENT WITH NO CREDENTIAL has no binding to ask about. It counts
 * when it holds any entry still matching a live connection, so the readiness
 * table can say "verified here, but no credential" — the hint that sends the
 * developer to issue one. It cannot open a write: readiness also needs a live
 * credential in that environment, and once one exists its own binding decides.
 *
 * Pure: the caller passes the rows.
 */
export function verifiedEnvironmentsForCredentials(
  serviceVerifications: unknown,
  connections: readonly CurrentConnection[],
  credentials: readonly { environment: string; sapClient: string | null }[],
): string[] {
  const out = new Set<string>();
  const withCredential = new Set(credentials.map((c) => c.environment));
  for (const entry of Object.values(parseServiceVerifications(serviceVerifications))) {
    if (!withCredential.has(entry.environment) && entryMatchesConnection(entry, connections)) {
      out.add(entry.environment);
    }
  }
  for (const credential of credentials) {
    const selected = selectConnectionForEnvironment(connections, credential.environment, "WRITE", credential.sapClient);
    if (!selected.ok) continue;
    const connection = selected.connection;
    if (
      isVerifiedForBinding(serviceVerifications, {
        environment: credential.environment,
        connectionId: connection.id,
        sapClient: connection.client ?? null,
        baseUrl: trimTrailingSlashes(connection.baseUrl),
      })
    ) {
      out.add(credential.environment);
    }
  }
  return [...out];
}
