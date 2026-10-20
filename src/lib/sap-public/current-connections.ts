/**
 * The organization's active SAP connections as they stand now — metadata only
 * (id, product, declared environment, SAP client, host, write switch), never
 * a secret.
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
  writeEnabled: boolean;
}): CurrentProductConnection {
  return {
    id: row.id,
    product: row.product,
    environment: normalizeEnvironment(row.environment),
    client: row.client ?? null,
    baseUrl: row.baseUrl,
    writeEnabled: row.writeEnabled,
  };
}

export async function loadCurrentConnections(
  organizationId: string,
  product?: string,
): Promise<CurrentProductConnection[]> {
  const rows = await prisma.sapConnection.findMany({
    where: { organizationId, isActive: true, ...(product ? { product } : {}) },
    select: { id: true, product: true, environment: true, client: true, baseUrl: true, writeEnabled: true },
  });
  return rows.map(toCurrentConnection);
}

/** A live credential, as readiness asks about it. */
export interface ReadinessCredential {
  environment: string;
  sapClient: string | null;
  /**
   * Whether a write key is sealed on it. Omitted means "not known" and is
   * treated like false: the credential's own binding still decides.
   */
  hasWriteKey?: boolean;
}

/**
 * The credentials whose binding decides an environment: its write-key
 * holders when it has any — a read-only credential beside them cannot write
 * (review round 4) — and otherwise every live credential in it.
 *
 * WHY NOT ONLY WRITE-KEY HOLDERS (review round 5). A write key is sealed onto
 * an existing credential row, which keeps its id and SAP client, and there is
 * one credential per solution and environment (SolutionClient's unique key).
 * So a read-only credential's binding IS the binding its future writes will
 * use. Asking only write-key holders left such an environment with "no
 * credential", where any matching entry counts — so a verify of PROD client
 * 100 said "service verified here" for a credential bound to client 200, the
 * developer was told the write key was the only missing piece, and sealing it
 * flipped the line to "not verified".
 */
function decidingCredentials(credentials: readonly ReadinessCredential[]): ReadinessCredential[] {
  const writersIn = new Set(credentials.filter((c) => c.hasWriteKey === true).map((c) => c.environment));
  return credentials.filter((c) => !writersIn.has(c.environment) || c.hasWriteKey === true);
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
 * (review round 3). So, for each deciding credential (decidingCredentials),
 * run the write route's own selection over the current connections and count
 * its environment only when that selected binding is the one that answered a
 * verify. A credential whose selection fails (no connection, ambiguous,
 * undeclared) counts nowhere — its writes are refused before the gate anyway.
 *
 * Pass EVERY live credential, with `hasWriteKey`: the write key is a separate
 * half of readiness, and the binding is judged whether or not it is there yet.
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
  credentials: readonly ReadinessCredential[],
): string[] {
  const out = new Set<string>();
  const withCredential = new Set(credentials.map((c) => c.environment));
  for (const entry of Object.values(parseServiceVerifications(serviceVerifications))) {
    if (!withCredential.has(entry.environment) && entryMatchesConnection(entry, connections)) {
      out.add(entry.environment);
    }
  }
  for (const credential of decidingCredentials(credentials)) {
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

/**
 * The environments whose deciding credential binds to a connection with
 * writes switched off (writeEnabled=false) — a deliberate per-tenant veto the
 * write route enforces on that very binding ("Writes are not enabled on this
 * SAP connection") whatever the grant and the verification say. Without this
 * the readiness table said "→ ready" and activation passed for an interface
 * every write of which was then refused (review round 5).
 *
 * Only an explicit `false` counts: a connection row read without the field
 * says nothing about it. A credential whose selection fails is not named —
 * its writes are refused for that reason, which is not this one.
 *
 * Pure: the caller passes the rows.
 */
export function writesDisabledEnvironmentsForCredentials(
  connections: readonly CurrentConnection[],
  credentials: readonly ReadinessCredential[],
): string[] {
  const out = new Set<string>();
  for (const credential of decidingCredentials(credentials)) {
    const selected = selectConnectionForEnvironment(connections, credential.environment, "WRITE", credential.sapClient);
    if (selected.ok && selected.connection.writeEnabled === false) out.add(credential.environment);
  }
  return [...out];
}
