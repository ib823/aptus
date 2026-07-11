/**
 * Resolve a service to inspect/preview in the Entity Explorer.
 *
 * Curated keys resolve via the product's known-good paths (the original 5).
 * ANY other key is looked up in SapHubContent by externalId (== apiId) and
 * converted to a probe target via hubApiToService — so an admin can spot-read
 * any activated service, not just the curated set. Read-only; a non-probeable
 * row (apiType null / SOAP) resolves to null and the caller 400s honestly.
 */
import { prisma } from "@/lib/db/prisma";
import { getSapService, type SapOdataProduct, type SapServiceDefinition } from "@/lib/sap-public/tdd-connector";
import { hubApiToService, type HubContentType } from "@/lib/sap-public/hub-content";

export async function resolveHubService(
  product: SapOdataProduct,
  key: string,
): Promise<SapServiceDefinition | null> {
  if (!key) return null;
  // Curated first — keeps the known-good V2/V4 paths authoritative.
  const curated = getSapService(product, key);
  if (curated) return curated;
  // Fall back to the full catalogue: externalId == apiId (last path segment).
  const row = await prisma.sapHubContent.findFirst({
    where: { externalId: key, appliesToPublic: true },
    select: { contentType: true, apiType: true, externalId: true, title: true, packageId: true, communicationScenarios: true },
  });
  if (!row) return null;
  return hubApiToService({ ...row, contentType: row.contentType as HubContentType });
}
