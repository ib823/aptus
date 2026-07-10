/**
 * Phase 3 — dependency + debug layer for the Capability Catalogue.
 *
 * Turns an AVAILABLE item into something actionable: which communication
 * scenarios and prerequisite scope items it needs, and an HONEST debug hint for
 * why a live probe returned what it did.
 *
 * Degrades gracefully: most seed items carry no scope codes, and a scopeCode can
 * map to 0/1/many ScopeItem rows across catalog versions — we match within the
 * active PUBLIC catalog version and, when nothing matches, say "prerequisite
 * unknown" rather than erroring.
 */
import type { PrismaClient } from "@prisma/client";
import { isRuntimeType, type HubContentType } from "@/lib/sap-public/hub-content";

export interface PrerequisiteScopeItem {
  scopeCode: string;
  nameClean: string;
  functionalArea: string;
  prerequisitesHtml: string;
}

export interface HubItemDependencies {
  communicationScenarios: string[];
  prerequisiteScopeItems: PrerequisiteScopeItem[];
  /** Set to "prerequisite unknown" when codes exist but none resolve; else null. */
  prerequisiteNote: string | null;
  debugHint: string;
}

const PREREQUISITE_UNKNOWN = "prerequisite unknown";

/**
 * Honest debug hint. 401/403/404 are phrased as LIKELY causes, not verdicts.
 * A 404 is deliberately ambiguous — it names BOTH "arrangement not activated"
 * and "our OData path convention may be wrong" so nobody debugs the wrong thing.
 */
export function debugHintForStatus(status: number | null, contentType: HubContentType): string {
  if (!isRuntimeType(contentType)) {
    return "Design-time reference content — not a tenant endpoint, so there is nothing to activate or probe.";
  }
  if (contentType === "EVENT") {
    return "Event stream — consumed by subscription (CloudEvents). There is no read endpoint to probe, so it stays Available.";
  }
  switch (status) {
    case 200:
      return "Activated — the tenant serves this now (live $metadata returned 200).";
    case 401:
      return "Likely a communication-user authentication problem — the tenant rejected the credentials (401).";
    case 403:
      return "Likely the communication scenario or the user's role is not authorized for this service (403).";
    case 404:
      return (
        "Ambiguous (404): either the communication arrangement for this service is not activated in the tenant, " +
        "OR our OData service-path convention is wrong for this item (some CDS views/services bind under a " +
        "different root). Check BOTH — do not assume it is only the arrangement."
      );
    case null:
    case 0:
      return "Not probed / no response — status unknown (no configured tenant, timeout, or network).";
    default:
      return `HTTP ${status} — unexpected; inspect the service on the tenant before concluding.`;
  }
}

/** The active PUBLIC catalog version id, or null if none is configured. */
export async function resolveActivePublicCatalogVersionId(prisma: PrismaClient): Promise<string | null> {
  const v = await prisma.scopeCatalogVersion.findFirst({
    where: { edition: "PUBLIC", isActive: true },
    orderBy: { ingestedAt: "desc" },
    select: { id: true },
  });
  return v?.id ?? null;
}

/**
 * Resolve an item's dependencies. `probeStatus` is the live HTTP status (null if
 * not probed). `catalogVersionId` overrides the active-PUBLIC lookup.
 */
export async function resolveHubItemDependencies(
  prisma: PrismaClient,
  item: { contentType: HubContentType; scopeItemCodes: string[]; communicationScenarios: string[] },
  probeStatus: number | null = null,
  catalogVersionId?: string | null,
): Promise<HubItemDependencies> {
  const debugHint = debugHintForStatus(probeStatus, item.contentType);
  const codes = item.scopeItemCodes ?? [];
  if (codes.length === 0) {
    return { communicationScenarios: item.communicationScenarios, prerequisiteScopeItems: [], prerequisiteNote: null, debugHint };
  }

  const versionId = catalogVersionId ?? (await resolveActivePublicCatalogVersionId(prisma));
  const rows = await prisma.scopeItem.findMany({
    where: {
      scopeCode: { in: codes },
      ...(versionId ? { catalogVersionId: versionId } : {}),
    },
    select: { scopeCode: true, nameClean: true, functionalArea: true, prerequisitesHtml: true },
  });

  // Dedupe by scopeCode (when no version filter, the same code can appear across
  // versions — keep one, deterministically).
  const seen = new Set<string>();
  const prerequisiteScopeItems: PrerequisiteScopeItem[] = [];
  for (const r of rows.sort((a, b) => a.scopeCode.localeCompare(b.scopeCode))) {
    if (seen.has(r.scopeCode)) continue;
    seen.add(r.scopeCode);
    prerequisiteScopeItems.push(r);
  }

  return {
    communicationScenarios: item.communicationScenarios,
    prerequisiteScopeItems,
    // Codes were declared but none resolved to a ScopeItem → unknown, not an error.
    prerequisiteNote: prerequisiteScopeItems.length === 0 ? PREREQUISITE_UNKNOWN : null,
    debugHint,
  };
}
