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
import { prisma } from "@/lib/db/prisma";
import type { SapServiceDefinition } from "@/lib/sap-public/tdd-connector";

const EDITION_FIELD = {
  PUBLIC: "appliesToPublic",
  PRIVATE: "appliesToPrivate",
  ON_PREM: "appliesToOnPrem",
} as const;
export type SapEdition = keyof typeof EDITION_FIELD;

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
