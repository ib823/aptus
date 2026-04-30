/**
 * Phase 13.6 — SAP API evidence helper for the classifier.
 *
 * For each batch of requirements, finds APIs that:
 *   1. Are tagged for the assessment's edition (PUBLIC/PRIVATE/ON_PREM)
 *   2. Cite scope items overlapping with the candidate scope items
 *   3. Are in the configurable status filter (default: Released only)
 *
 * The matched APIs are formatted as a short text block appended to the
 * Claude user message, giving the AI grounded evidence about which
 * integration boundaries actually exist.
 *
 * Defensive design: if the SapApiReference table is empty (e.g. before
 * the user has imported their api.sap.com export), this helper returns
 * an empty array and the classifier proceeds without API evidence —
 * zero behavior change relative to pre-Phase-13.6.
 *
 * Toggleable via env: ENABLE_API_HUB_GROUNDING="0" disables the lookup
 * entirely (for A/B comparison or fallback in incidents).
 */

import { prisma } from "@/lib/db/prisma";

export interface ApiEvidence {
  apiId: string;
  apiName: string;
  status: string;
  scopeItemCodes: string[];
  apiHubUrl: string;
}

export interface FindMatchingApisOpts {
  /** Scope-item codes (e.g. ["J60", "BJ8"]) extracted from the candidate set */
  scopeItemCodes: string[];
  /** The catalog's edition: "PUBLIC" | "PRIVATE" | "ON_PREM" */
  catalogEdition: string;
  /**
   * Acceptable lifecycle states. Default: only "Released". Beta + Deprecated
   * APIs are weak grounding signals — including Beta would inflate confidence
   * incorrectly; including Deprecated would prefer dying APIs over current ones.
   */
  acceptedStatuses?: string[];
  /** Max APIs returned per batch. Default: 12 — keeps token budget low. */
  limit?: number;
}

/**
 * Look up SAP APIs that ground a batch of requirements.
 *
 * Matching rules (in priority order):
 *   1. Edition gate: API must be tagged for the assessment's edition
 *   2. Status gate: API.status ∈ acceptedStatuses
 *   3. Scope gate: API.scopeItemCodes intersects with the requested codes
 *   4. Sort: APIs covering more requested codes win; ties broken by name
 */
export async function findMatchingApis(
  opts: FindMatchingApisOpts,
): Promise<ApiEvidence[]> {
  // Hard kill switch
  if (process.env.ENABLE_API_HUB_GROUNDING === "0") return [];

  // No scope candidates → nothing to match against
  if (opts.scopeItemCodes.length === 0) return [];

  const acceptedStatuses = opts.acceptedStatuses ?? ["Released"];
  const limit = opts.limit ?? 12;

  // Edition predicate
  const editionField =
    opts.catalogEdition === "PUBLIC"
      ? "appliesToPublic"
      : opts.catalogEdition === "PRIVATE"
        ? "appliesToPrivate"
        : opts.catalogEdition === "ON_PREM"
          ? "appliesToOnPrem"
          : null;
  if (!editionField) {
    // Unknown edition → fail closed (no API evidence rather than wrong evidence)
    return [];
  }

  // Pull candidates (using `hasSome` for array overlap on Postgres)
  const candidates = await prisma.sapApiReference.findMany({
    where: {
      [editionField]: true,
      status: { in: acceptedStatuses },
      scopeItemCodes: { hasSome: opts.scopeItemCodes },
    },
    select: {
      apiId: true,
      apiName: true,
      status: true,
      scopeItemCodes: true,
      apiHubUrl: true,
    },
  });

  // Sort by overlap count (descending), then by name (ascending) for determinism
  const wanted = new Set(opts.scopeItemCodes);
  const scored = candidates.map((api) => {
    let overlap = 0;
    for (const code of api.scopeItemCodes) if (wanted.has(code)) overlap++;
    return { api, overlap };
  });
  scored.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    return a.api.apiName.localeCompare(b.api.apiName);
  });

  return scored.slice(0, limit).map((s) => s.api);
}

/**
 * Format matched APIs as a compact text block for inclusion in the
 * classifier's user message. Designed to fit ~300-500 tokens for 12 APIs.
 *
 * Returns an empty string if no APIs match — caller can append unconditionally.
 */
export function formatApiEvidenceForPrompt(apis: ApiEvidence[]): string {
  if (apis.length === 0) return "";
  const lines = apis.map((a) => {
    const scopes = a.scopeItemCodes.slice(0, 4).join(",") + (a.scopeItemCodes.length > 4 ? `+${a.scopeItemCodes.length - 4}` : "");
    return `${a.apiId} | ${a.status} | scopes ${scopes} | ${a.apiName}`;
  });
  return `\n\n## SAP API HUB EVIDENCE (released APIs covering candidate scope items)
The following SAP APIs are documented as supporting these scope items. A "Released" API is strong evidence the requirement can be met via integration (Configuration / via API), not Gap.
${lines.join("\n")}`;
}
