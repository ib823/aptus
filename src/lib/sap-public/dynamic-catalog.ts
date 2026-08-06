/**
 * Move 2 — Dynamic service catalog.
 *
 * Replaces the hardcoded S4HANA_SERVICES list with services derived from the
 * cached SAP Business Accelerator Hub catalogue (SapApiReference). Import the
 * catalogue first (scripts/import-sap-api-catalog.ts, or the s4-public-api-seed.json).
 *
 * Only OData services are returned — they are the callable/probeable surface.
 * V2 service paths follow the stable convention /sap/opu/odata/sap/<apiId>.
 * V4 service-group paths are NOT reliably derivable from the apiId alone
 * (they need the service-group $metadata), so V4 is opt-in and best-effort.
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { SapServiceDefinition } from "@/lib/sap-public/tdd-connector";

const EDITION_FIELD = {
  PUBLIC: "appliesToPublic",
  PRIVATE: "appliesToPrivate",
  ON_PREM: "appliesToOnPrem",
} as const;
export type SapEdition = keyof typeof EDITION_FIELD;

/**
 * Products that are NOT editions of S/4HANA, and so are unreachable by edition.
 *
 * THE GAP THIS ADDRESSES. `getDynamicOdataServices` filters on the edition
 * booleans, which is right for S/4: every row is public, private, on-prem, or
 * some combination. Ariba and SuccessFactors are not editions of anything —
 * they correctly carry NO edition flag — so an edition filter can never return
 * them. 321 harvested rows were addressable by no query at all until
 * `SapApiReference.productTags` began storing SAP's tag string verbatim.
 */
export type SapNonEditionProduct = "ariba" | "successfactors";

/**
 * A `where` fragment selecting one non-edition product's rows by product tag.
 *
 * MATCHES BOTH DIALECTS SAP WRITES. The Hub's OData emits "SAPAriba" and
 * "SAPSuccessFactors" (no spaces); a downloaded export writes "SAP Ariba" and
 * "SAP SuccessFactors". A case-insensitive substring on the un-spaced core
 * covers both, and no S/4 tag contains either word — see the truth table in
 * tests/unit/sap/by-product-retrieval.test.ts.
 *
 * RETRIEVAL ONLY, DELIBERATELY. It does not derive service paths, because
 * `odataPath` builds `/sap/opu/odata/sap/<apiId>` — an S/4 convention that is
 * wrong for SuccessFactors (one `/odata/v2` root) and meaningless for Ariba
 * (REST, not OData). Wiring these into probe targets would manufacture URLs
 * that 404 by construction. Path derivation waits for a live system of each to
 * verify against; this makes the rows countable and queryable in the meantime.
 */
export function productTagFilter(product: SapNonEditionProduct): {
  productTags: { contains: string; mode: "insensitive" };
} {
  return {
    productTags: {
      contains: product === "ariba" ? "ariba" : "successfactors",
      mode: "insensitive",
    },
  };
}

/** How many catalogue rows this repository holds for a non-edition product. */
export async function countByProduct(product: SapNonEditionProduct): Promise<number> {
  return prisma.sapApiReference.count({ where: productTagFilter(product) });
}

/**
 * THE PRODUCT-AWARE CATALOGUE SCOPE — one resolver for every read path.
 *
 * Until this existed, every SapHubContent query hardcoded
 * `appliesToPublic: true` (eight sites in the hub-content route alone, plus
 * probe-all, resolve-hub-service and the seed), so `?product=` selected which
 * TENANT to probe and never which CATALOGUE to show: SuccessFactors, RISE,
 * on-premise and ECC all rendered the S/4 Public list with the same counts.
 * That is the defect this branch is named for.
 *
 * Three kinds, because the products genuinely differ in what "their published
 * catalogue" means:
 *
 *   edition      S/4 editions — filter on the row's edition flag. The paths
 *                are shared across editions (tdd-connector documents why);
 *                the PUBLISHED SET is what differs, and it is these flags.
 *   product-tag  SuccessFactors / Ariba — not editions of anything; their
 *                rows are selected by SAP's verbatim product tag, and they are
 *                NOT probeable from here (path derivation waits for a live
 *                system — see productTagFilter's RETRIEVAL ONLY note). Only
 *                the curated services carry real, probeable paths.
 *   none         ECC — deliberately no published list. Its OData surface is
 *                whatever the customer activated in their own Gateway, which
 *                only discovery from that Gateway's catalogue can say
 *                (spec §3.1). An empty catalogue is the honest answer; the
 *                S/4 on-prem list would be a confident wrong one.
 */
export type HubCatalogueScope =
  | { kind: "edition"; edition: SapEdition; where: Prisma.SapHubContentWhereInput }
  | { kind: "product-tag"; product: SapNonEditionProduct; where: Prisma.SapHubContentWhereInput }
  | { kind: "none"; reason: string };

export function hubCatalogueScope(product: {
  key: string;
  edition: SapEdition | null;
}): HubCatalogueScope {
  if (product.key === "ecc") {
    return {
      kind: "none",
      reason:
        "ECC has no published service list — its OData surface is whatever the customer activated in their own NetWeaver Gateway. Discovery from the tenant's Gateway catalogue is the honest source, and it is not built yet.",
    };
  }
  if (product.edition) {
    const field = EDITION_FIELD[product.edition];
    return { kind: "edition", edition: product.edition, where: { [field]: true } };
  }
  if (product.key === "successfactors" || product.key === "ariba") {
    return { kind: "product-tag", product: product.key, where: productTagFilter(product.key) };
  }
  // An unknown non-edition product must not silently inherit another
  // product's catalogue — nothing is the honest default.
  return {
    kind: "none",
    reason: `No published catalogue mapping exists for "${product.key}".`,
  };
}

export interface DynamicCatalogOpts {
  edition?: SapEdition;
  /** Lifecycle states to include. Default: current, non-deprecated. */
  statuses?: string[];
  /** Include OData V4 (best-effort path derivation). Default: false. */
  includeV4?: boolean;
  /** Cap the number of services (keeps probe load bounded). Default: 60. */
  limit?: number;
}

/** Map a released API id to its OData service path (V2 stable, V4 best-effort). */
function odataPath(apiId: string, apiType: string | null, includeV4: boolean): string | null {
  if (apiType === "ODATAV2") return `/sap/opu/odata/sap/${apiId}`;
  if (apiType === "ODATAV4" && includeV4) {
    // Best-effort only; verify the real service-group path from the tenant catalog.
    return `/sap/opu/odata4/sap/${apiId.toLowerCase()}/srvd_a2x/sap/${apiId.toLowerCase()}/0001`;
  }
  return null; // SOAP / events / design-time content are not OData-probeable
}

/**
 * Return the OData services SAP publishes for the given edition, as
 * SapServiceDefinition[] — a drop-in replacement for product.services.
 */
export async function getDynamicOdataServices(
  opts: DynamicCatalogOpts = {},
): Promise<SapServiceDefinition[]> {
  const field = EDITION_FIELD[opts.edition ?? "PUBLIC"];
  const includeV4 = opts.includeV4 ?? false;

  const rows = await prisma.sapApiReference.findMany({
    where: {
      [field]: true,
      status: { in: opts.statuses ?? ["Released", "Active"] },
      apiType: { in: includeV4 ? ["ODATAV2", "ODATAV4"] : ["ODATAV2"] },
    },
    select: {
      apiId: true,
      apiName: true,
      apiType: true,
      category: true,
      communicationScenarios: true,
    },
    orderBy: { apiId: "asc" },
    take: opts.limit ?? 60,
  });

  const services: SapServiceDefinition[] = [];
  for (const r of rows) {
    const path = odataPath(r.apiId, r.apiType, includeV4);
    if (!path) continue;
    services.push({
      key: r.apiId.toLowerCase(),
      label: r.apiName,
      scenario: r.communicationScenarios[0] ?? "",
      path,
      domain: r.category ?? "",
    });
  }
  return services;
}

/**
 * Build the probe target list: the curated services first (the ones we've wired
 * up and expect the tenant to have activated — e.g. the S/4HANA procurement/
 * finance set), then the dynamic-catalogue services not already present,
 * deduped by OData path. Capped to `limit` so the probe stays bounded.
 *
 * Curated-first matters: the dynamic catalogue is ordered by apiId, so a naive
 * take(60) samples only the alphabetical head (API_A…/B…) and can miss the
 * handful of services a demo/TDD tenant actually activated. Seeding the probe
 * with the curated set guarantees those are always tested.
 */
export function mergeProbeTargets(
  curated: SapServiceDefinition[],
  dynamic: SapServiceDefinition[],
  limit = 60,
): SapServiceDefinition[] {
  const seen = new Set<string>();
  const merged: SapServiceDefinition[] = [];
  for (const svc of [...curated, ...dynamic]) {
    if (!svc.path || seen.has(svc.path)) continue;
    seen.add(svc.path);
    merged.push(svc);
    if (merged.length >= limit) break;
  }
  return merged;
}
