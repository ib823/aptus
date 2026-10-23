/**
 * A tenant's listed services, classified and stored (roadmap P1.2): what the
 * live listing route writes after its console call, and what Discover reads
 * back without asking the tenant again.
 *
 * CLASSIFIED AGAINST SAP'S OWN SOURCES, IN TWO STATEMENTS. The catalogue rows
 * of the product's edition the listed names could be (one `externalId IN`
 * lookup), and — on S/4HANA Cloud Public Edition only, whose documentation it
 * is — the communication scenario table (one statement, comm-scenarios.ts).
 * CoreEdge's curated services are in code. The rule itself is pure
 * (tenant-discovery.ts classifyService).
 *
 * STORED PER ORGANISATION AND CONNECTION, one row, replaced by each listing
 * in one statement. A deployment tenant's listing is never stored: those
 * systems are shared by every organisation here, and an inventory of one
 * filed under any organisation would be shown to the wrong ones.
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { scenariosForServices, technicalIdsForAddress, type ScenarioJoin } from "@/lib/sap-public/comm-scenarios";
import { hubCatalogueScope } from "@/lib/sap-public/dynamic-catalog";
import { catalogueAddress, KNOWN_V4_SERVICE_PATHS, type HubContentType } from "@/lib/sap-public/hub-content";
import { getSapServices, type SapOdataProduct } from "@/lib/sap-public/tdd-connector";
import {
  classifyService,
  entriesWithinStoredBound,
  readStoredEntries,
  sourceIdOf,
  type CatalogueStatus,
  type ClassificationIndex,
  type ListedService,
  type ListingEntry,
  type V4CatalogueStatus,
} from "@/lib/sap-public/tenant-discovery";

/**
 * ONE LIVE LISTING PER TENANT EVERY TWO MINUTES [estimate], keyed by the
 * tenant's owner and key (two consultants on one client's system share it, as
 * Probe all's limit does). A listing is up to ten requests into the client's
 * system, and its answer is stored: a second one moments later learns nothing
 * new.
 */
export const TENANT_SERVICES_LIMIT = { limit: 1, windowMs: 2 * 60_000 } as const;

/** The product whose documentation SAP's communication scenario table is. */
export const SCENARIO_TABLE_PRODUCT = "s4hana";

/** Products whose systems serve an SAP Gateway catalogue: S/4HANA in every edition, and ECC with Gateway. */
const GATEWAY_PRODUCTS = new Set(["s4hana", "cloud-erp-private", "s4hana-onprem", "ecc"]);

export function productHasGatewayCatalogue(productKey: string): boolean {
  return GATEWAY_PRODUCTS.has(productKey);
}

/** Is the V4 catalogue tried for this product? Never on S/4 Public (Q8): SAP's table gives no scenario that opens it there. */
export function v4CatalogueAllowed(productKey: string): boolean {
  return productHasGatewayCatalogue(productKey) && productKey !== SCENARIO_TABLE_PRODUCT;
}

export interface Classified {
  readonly entries: ListingEntry[];
  readonly join: ScenarioJoin;
}

/**
 * Classify a listing against the product's published sources: the catalogue
 * rows the names could be (one statement, skipped for a product with no
 * published list) and, on S/4 Public, SAP's scenario table (one statement).
 */
export async function classifyListing(product: SapOdataProduct, listed: readonly ListedService[]): Promise<Classified> {
  const published = new Set<string>();
  const catalogueById = new Map<string, string>();
  for (const s of getSapServices(product)) {
    for (const id of technicalIdsForAddress({ path: s.path, protocol: s.protocol ?? null })) published.add(id);
  }
  const scope = hubCatalogueScope(product);
  // A V2 catalogue row's address is /sap/opu/odata/sap/<apiId>, so a listed
  // name without a namespace may be one; a V4 row is joined only through a
  // binding this repository has verified (KNOWN_V4_SERVICE_PATHS).
  const names = [
    ...new Set(listed.filter((e) => e.odataVersion === "V2" && !e.technicalName.startsWith("/")).map((e) => e.technicalName)),
    ...Object.keys(KNOWN_V4_SERVICE_PATHS),
  ];
  if (scope.kind === "edition" && listed.length > 0) {
    const rows = await prisma.sapHubContent.findMany({
      where: { AND: [scope.where, { externalId: { in: names } }, { contentType: { in: ["API", "CDS_VIEW"] } }] },
      select: { externalId: true, apiType: true, contentType: true },
    });
    for (const r of rows) {
      const address = catalogueAddress({ contentType: r.contentType as HubContentType, apiType: r.apiType, externalId: r.externalId }, "s4");
      if (!address || address.basis === "derived") continue;
      for (const id of technicalIdsForAddress(address)) {
        published.add(id);
        catalogueById.set(id, r.externalId);
      }
    }
  }
  const join: ScenarioJoin =
    product.key === SCENARIO_TABLE_PRODUCT && listed.length > 0
      ? await scenariosForServices(prisma, listed.map(sourceIdOf))
      : { release: null, byId: new Map() };
  const index: ClassificationIndex = { published, inScenarioTable: new Set(join.byId.keys()) };
  const entries = listed.map((e): ListingEntry => {
    const id = sourceIdOf(e);
    const cls = classifyService(e, index);
    return {
      id: e.id,
      technicalName: e.technicalName,
      version: e.version,
      odataVersion: e.odataVersion,
      path: e.path,
      title: e.title,
      class: cls,
      catalogueExternalId: catalogueById.get(id) ?? null,
      // Exact matches only, and only for a Published service: a customer's own
      // is enabled by a scenario the customer created, never an SAP one.
      scenarioIds: cls === "PUBLISHED" ? (join.byId.get(id) ?? []).map((s) => s.id) : [],
    };
  });
  return { entries, join };
}

export interface StoredListing {
  readonly listedAt: Date;
  readonly listedById: string;
  readonly correlationId: string;
  readonly catalogueStatus: CatalogueStatus;
  readonly v4Status: V4CatalogueStatus | null;
  readonly entryCount: number;
  readonly truncated: boolean;
  readonly entries: ListingEntry[];
  /** The connection was saved again since this listing: it may describe another system. */
  readonly connectionChanged: boolean;
}

/**
 * Replace the connection's stored listing, in ONE statement (an insert that
 * updates on the organisation-and-connection key). The entries are cut to
 * LISTING_LIMITS.storedBytes first; a cut marks the listing truncated.
 */
export async function storeListing(input: {
  readonly organizationId: string;
  readonly connectionId: string;
  readonly connectionRevision: number;
  readonly product: string;
  readonly listedById: string;
  readonly correlationId: string;
  readonly catalogueStatus: CatalogueStatus;
  readonly v4Status: V4CatalogueStatus;
  readonly truncated: boolean;
  readonly entries: readonly ListingEntry[];
}): Promise<{ entries: ListingEntry[]; truncated: boolean }> {
  const { entries, cut } = entriesWithinStoredBound(input.entries);
  const truncated = input.truncated || cut > 0;
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "TenantServiceListing"
      ("id", "organizationId", "connectionId", "connectionRevision", "product", "listedAt", "listedById", "correlationId",
       "catalogueStatus", "v4Status", "entryCount", "truncated", "entries")
    VALUES (${randomUUID()}, ${input.organizationId}, ${input.connectionId}, ${input.connectionRevision}, ${input.product}, now(),
            ${input.listedById}, ${input.correlationId}, ${input.catalogueStatus}, ${input.v4Status}, ${entries.length},
            ${truncated}, ${JSON.stringify(entries)}::jsonb)
    ON CONFLICT ("organizationId", "connectionId") DO UPDATE SET
      "connectionRevision" = EXCLUDED."connectionRevision", "product" = EXCLUDED."product", "listedAt" = EXCLUDED."listedAt",
      "listedById" = EXCLUDED."listedById", "correlationId" = EXCLUDED."correlationId",
      "catalogueStatus" = EXCLUDED."catalogueStatus", "v4Status" = EXCLUDED."v4Status",
      "entryCount" = EXCLUDED."entryCount", "truncated" = EXCLUDED."truncated", "entries" = EXCLUDED."entries"
  `);
  return { entries, truncated };
}

/** The connection's stored listing, as this build reads it, or null. One statement. */
export async function readListing(
  organizationId: string,
  connection: { readonly id: string; readonly revision: number },
): Promise<StoredListing | null> {
  const row = await prisma.tenantServiceListing.findFirst({
    where: { organizationId, connectionId: connection.id },
  });
  if (!row) return null;
  return {
    listedAt: row.listedAt,
    listedById: row.listedById,
    correlationId: row.correlationId,
    catalogueStatus: row.catalogueStatus as CatalogueStatus,
    v4Status: (row.v4Status as V4CatalogueStatus | null) ?? null,
    entryCount: row.entryCount,
    truncated: row.truncated,
    entries: readStoredEntries(row.entries),
    connectionChanged: row.connectionRevision !== connection.revision,
  };
}
