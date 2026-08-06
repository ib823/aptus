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
import { hubCatalogueScope } from "@/lib/sap-public/dynamic-catalog";

export async function resolveHubService(
  product: SapOdataProduct,
  key: string,
): Promise<SapServiceDefinition | null> {
  if (!key) return null;
  // Curated first — keeps the known-good V2/V4 paths authoritative.
  const curated = getSapService(product, key);
  if (curated) return curated;
  /*
   * Catalogue fallback is EDITION-ONLY, in the requested product's own scope.
   * This filtered `appliesToPublic: true` regardless of product, so an
   * on-prem product resolved a PUBLIC-edition row — and a non-edition product
   * (SuccessFactors) would have resolved an S/4 row whose derived path is
   * wrong for its host by construction. Non-edition products have exactly
   * their curated services; anything else resolves null and the caller 400s
   * honestly.
   */
  const scope = hubCatalogueScope(product);
  if (scope.kind !== "edition") return null;
  const row = await prisma.sapHubContent.findFirst({
    where: { ...scope.where, externalId: key },
    select: { contentType: true, apiType: true, externalId: true, title: true, packageId: true, communicationScenarios: true },
  });
  if (!row) return null;
  return hubApiToService({ ...row, contentType: row.contentType as HubContentType });
}
