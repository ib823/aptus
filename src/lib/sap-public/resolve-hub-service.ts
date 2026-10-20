/**
 * Resolve a service to inspect/preview in the Entity Explorer.
 *
 * Curated keys resolve via the product's known-good paths (the original 5).
 * ANY other key is looked up in SapHubContent by externalId (== apiId) and
 * converted to a probe target via hubApiToService — so an admin can spot-read
 * any activated service, not just the curated set. Read-only; a row with no
 * address (apiType null / SOAP / a `sap-s4-*` wrapper) resolves to null and the
 * caller 400s honestly.
 */
import { prisma } from "@/lib/db/prisma";
import { getSapService, type SapOdataProduct, type SapServiceDefinition } from "@/lib/sap-public/tdd-connector";
import { catalogueAddressFamily, hubApiToService, type HubContentType } from "@/lib/sap-public/hub-content";
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
   * Catalogue fallback, in the requested product's OWN scope and under its
   * OWN address rules (catalogueAddress).
   *
   *   S/4 editions   — the edition's rows; per-service paths.
   *   SuccessFactors — the product-tag rows (P0.8). It resolved only its three
   *                    curated keys ("employee-central", "recruiting",
   *                    "onboarding"), so a SuccessFactors interface named by
   *                    the Hub id Discover shows (PLTUserManagement,
   *                    RCMCandidate…) was refused although the address is not
   *                    in doubt: SuccessFactors serves every OData V2 API from
   *                    the one /odata/v2 root, and the entity set picks the
   *                    data. V4 and REST rows still resolve to nothing.
   *   anything else  — nothing (Ariba is REST; ECC publishes no list).
   *
   * This filtered `appliesToPublic: true` regardless of product once, so an
   * on-prem product resolved a PUBLIC-edition row; the scope keeps each
   * product to its own published set.
   */
  const scope = hubCatalogueScope(product);
  if (scope.kind === "none") return null;
  const family = catalogueAddressFamily(product);
  if (family === "none") return null;
  const row = await prisma.sapHubContent.findFirst({
    where: { ...scope.where, externalId: key },
    select: { contentType: true, apiType: true, externalId: true, title: true, packageId: true, communicationScenarios: true },
  });
  if (!row) return null;
  return hubApiToService({ ...row, contentType: row.contentType as HubContentType }, family);
}
