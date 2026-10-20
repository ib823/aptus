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
import { normalizeEnvironment } from "@/lib/sap-public/connection-resolver";
import type { CurrentConnection } from "@/lib/sap-public/service-verifications";

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
