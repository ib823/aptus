/**
 * Which SAP service an INTERFACE calls — its own, or the catalogue's.
 *
 * Every runtime path asks this one function: the northbound read and write,
 * the Test Console's broker run, the lane checks, and the discovery advisory.
 * One answer, so the advisory, the dry run and the real call cannot disagree.
 *
 * PRECEDENCE, AND NO FALLBACK.
 *   1. The interface carries its own `servicePath` → that path, and only it.
 *      If the stored path no longer validates, or the product is not OData,
 *      the answer is null and the caller refuses the call (400). It never
 *      falls through to the catalogue: a custom interface that quietly called
 *      a catalogue service would serve data nobody granted.
 *   2. Otherwise → exactly what it was before this module existed:
 *      `resolveHubService(product, externalId)` (curated list, then the
 *      product's own catalogue scope).
 *
 * WHY A SEPARATE MODULE. Tests across the suite mock
 * `@/lib/sap-public/resolve-hub-service` to stand in for the catalogue. Those
 * mocks keep intercepting the catalogue branch only because this module
 * imports that one; folding this resolver into it would let the mocks erase
 * the custom branch too.
 *
 * SERVER-ONLY — `resolve-hub-service` reaches prisma. The pure validation the
 * Studio form shares lives in `service-path.ts`.
 */

import { resolveHubService } from "@/lib/sap-public/resolve-hub-service";
import {
  SAP_ODATA_PRODUCTS,
  type SapOdataProduct,
  type SapServiceDefinition,
} from "@/lib/sap-public/tdd-connector";
import {
  CUSTOM_EXTERNAL_ID_PREFIX,
  isODataVersion,
  validateServicePath,
} from "@/lib/sap-public/service-path";

/**
 * OData products only. Ariba is a REST product with an OData placeholder (see
 * getSapProduct) and has no service path to carry; an unknown key has none
 * either.
 */
export function productAcceptsServicePath(productKey: string): boolean {
  return SAP_ODATA_PRODUCTS.some((p) => p.key === productKey);
}

export interface InterfaceServiceFields {
  sapProduct: string;
  externalId: string;
  /** Optional: test doubles and older selects omit it, and that reads as catalogue. */
  servicePath?: string | null;
  odataVersion?: string | null;
}

export function hasCustomService(i: Pick<InterfaceServiceFields, "servicePath">): boolean {
  return i.servicePath != null && i.servicePath !== "";
}

/**
 * The custom service as the connector's service shape, or null.
 *
 * Pure. Null unless the interface is custom, its product accepts a path and is
 * the product asked about, the stored path re-validates AND is already in its
 * normalized form, and the version is V2 or V4. Re-validating a stored value
 * is defence in depth: the API only ever stores a valid path, and a row edited
 * by hand must not become a way round that.
 */
export function customServiceDefinition(
  product: Pick<SapOdataProduct, "key">,
  i: InterfaceServiceFields,
): SapServiceDefinition | null {
  if (!hasCustomService(i)) return null;
  if (!productAcceptsServicePath(i.sapProduct) || product.key !== i.sapProduct) return null;
  const check = validateServicePath(i.servicePath);
  if (!check.ok || check.path !== i.servicePath) return null;
  if (!isODataVersion(i.odataVersion)) return null;
  return {
    key: i.externalId,
    label: i.externalId,
    scenario: "",
    domain: "",
    path: check.path,
    protocol: i.odataVersion === "V4" ? "ODATAV4" : "ODATAV2",
  };
}

export type ResolvedInterfaceService = {
  source: "custom" | "catalogue";
  service: SapServiceDefinition;
};

export async function resolveInterfaceService(
  product: SapOdataProduct,
  i: InterfaceServiceFields,
): Promise<ResolvedInterfaceService | null> {
  if (hasCustomService(i)) {
    const service = customServiceDefinition(product, i);
    // Never falls back — see the header.
    return service ? { source: "custom", service } : null;
  }
  // A `custom:` id with no path is a row that lost its path. It names no
  // catalogue service, and resolving it as one would be a guess.
  if (i.externalId.startsWith(CUSTOM_EXTERNAL_ID_PREFIX)) return null;
  const service = await resolveHubService(product, i.externalId);
  return service ? { source: "catalogue", service } : null;
}
