/**
 * Canonical apiType refresh — overwrites the heuristic with authoritative
 * data fetched from api.sap.com via the user's S-User session.
 *
 * Source: api-hub-s4hcpe-odatav4.json fetched 2026-05-03 by chrome-claude
 * (S-User session, /api/1.0/container/SAPS4HANACloudPrivateEdition/artifacts
 * with $filter=Type eq 'API' and SubType eq 'ODATAV4', $top=1000).
 *
 * Behavior:
 *   1. Reads the canonical JSON file
 *   2. For each canonical API:
 *      - If apiId exists in DB → set apiType='ODATAV4', appliesToPrivate=true,
 *        status from canonical (Released | Deprecated)
 *      - If new → INSERT a row with full metadata
 *   3. Identifies heuristic mis-tags: existing rows tagged
 *      apiType='ODATAV4'+appliesToPrivate=true that are NOT in canonical
 *      → clears apiType to NULL (they were heuristic guesses; canonical
 *      authority overrules)
 *   4. Writes a delta report to logs/api-hub-canonical-vs-heuristic.md
 *
 * Idempotent.
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/refresh-api-types-from-canonical.ts \
 *       /workspaces/aptus/Conversion/api-hub-s4hcpe-odatav4.json
 */

import { readFileSync, writeFileSync } from "fs";
import { mkdirSync } from "fs";
import { prisma } from "../../src/lib/db/prisma";

interface CanonicalApi {
  apiId: string;
  apiName: string;
  apiType: string;
  status: string;
  apiHubUrl: string;
  rawProductCategory: string | null;
  scopeItemCodes: string[];
  version?: string;
  description?: string;
  modifiedAt?: string;
  createdAt?: string;
  regId?: string;
}

interface CanonicalFile {
  source: string;
  fetchedAt: string;
  fetchedBy: string;
  totalCount: number;
  apis: CanonicalApi[];
  _notes?: unknown;
}

interface DeltaReport {
  canonicalCount: number;
  fetchedAt: string;
  fetchedBy: string;
  source: string;
  alreadyInDb: number;
  insertedNew: number;
  retaggedToCanonical: number;
  heuristicMistagsCleared: number;
  heuristicMistagSamples: string[];
  statusBreakdown: Record<string, number>;
  patternBreakdown: Record<string, number>;
}

function patternOf(apiId: string): string {
  if (apiId.startsWith("sap-s4-")) return "sap-s4-";
  if (apiId.startsWith("OP_")) return "OP_";
  if (apiId.startsWith("CE_")) return "CE_";
  if (apiId.startsWith("IS_")) return "IS_";
  if (apiId.startsWith("SAP_ICSM_")) return "SAP_ICSM_";
  return "other";
}

async function main(): Promise<void> {
  const inputPath = process.argv[2] ?? "/workspaces/aptus/Conversion/api-hub-s4hcpe-odatav4.json";
  console.log(`[canonical-merge] Reading ${inputPath}`);
  const raw = readFileSync(inputPath, "utf8");
  const file = JSON.parse(raw) as CanonicalFile;
  console.log(
    `[canonical-merge] Source: ${file.source}\n[canonical-merge] Fetched: ${file.fetchedAt} by ${file.fetchedBy}\n[canonical-merge] Canonical count: ${file.totalCount}`,
  );

  if (file.apis.length !== file.totalCount) {
    console.warn(
      `[canonical-merge] WARN: totalCount=${file.totalCount} but apis array has ${file.apis.length} items — proceeding with array length`,
    );
  }

  const canonicalIds = new Set(file.apis.map((a) => a.apiId));

  // 1) Existing rows that match canonical IDs
  const existing = await prisma.sapApiReference.findMany({
    where: { apiId: { in: Array.from(canonicalIds) } },
    select: { id: true, apiId: true, apiType: true, appliesToPrivate: true, status: true },
  });
  const existingByApiId = new Map(existing.map((r) => [r.apiId, r]));
  console.log(`[canonical-merge] Already in DB: ${existing.length}`);
  const newApis = file.apis.filter((a) => !existingByApiId.has(a.apiId));
  console.log(`[canonical-merge] Net-new to INSERT: ${newApis.length}`);

  // 2) Heuristic mis-tags: rows tagged ODATAV4+Private that are NOT canonical
  const heuristicV4Private = await prisma.sapApiReference.findMany({
    where: { apiType: "ODATAV4", appliesToPrivate: true },
    select: { id: true, apiId: true },
  });
  const heuristicMistags = heuristicV4Private.filter((r) => !canonicalIds.has(r.apiId));
  console.log(`[canonical-merge] Heuristic mis-tags to clear: ${heuristicMistags.length}`);

  // Status + pattern stats for the report
  const statusBreakdown: Record<string, number> = {};
  const patternBreakdown: Record<string, number> = {};
  for (const a of file.apis) {
    statusBreakdown[a.status] = (statusBreakdown[a.status] ?? 0) + 1;
    const p = patternOf(a.apiId);
    patternBreakdown[p] = (patternBreakdown[p] ?? 0) + 1;
  }

  // -- Apply updates --

  let retagged = 0;
  let inserted = 0;
  const chunkSize = 100;

  // Update existing rows in chunks (apiType=ODATAV4, appliesToPrivate=true, status sync)
  for (let i = 0; i < file.apis.length; i += chunkSize) {
    const slice = file.apis.slice(i, i + chunkSize);
    await prisma.$transaction(
      slice.flatMap((api) => {
        const row = existingByApiId.get(api.apiId);
        if (!row) return [];
        retagged++;
        return prisma.sapApiReference.update({
          where: { id: row.id },
          data: {
            apiType: "ODATAV4",
            appliesToPrivate: true,
            status: api.status,
          },
        });
      }),
    );
  }
  console.log(`[canonical-merge] Retagged ${retagged} existing rows to canonical (apiType=ODATAV4, appliesToPrivate=true)`);

  // Insert net-new rows
  if (newApis.length > 0) {
    await prisma.sapApiReference.createMany({
      data: newApis.map((a) => ({
        apiId: a.apiId,
        apiName: a.apiName,
        description: a.description ?? "",
        status: a.status,
        category: null,
        appliesToPublic: false,
        appliesToPrivate: true,
        appliesToOnPrem: false,
        apiType: "ODATAV4",
        scopeItemCodes: a.scopeItemCodes ?? [],
        communicationScenarios: [],
        apiHubUrl: a.apiHubUrl,
      })),
      skipDuplicates: true,
    });
    inserted = newApis.length;
    console.log(`[canonical-merge] Inserted ${inserted} new rows`);
  }

  // Clear heuristic mis-tags (set apiType to NULL — these may still be valid
  // OData v4 APIs but for a different edition; canonical-for-this-edition
  // overrules)
  if (heuristicMistags.length > 0) {
    await prisma.sapApiReference.updateMany({
      where: { id: { in: heuristicMistags.map((r) => r.id) } },
      data: { apiType: null },
    });
    console.log(`[canonical-merge] Cleared ${heuristicMistags.length} heuristic mis-tags (apiType=NULL)`);
  }

  // Verification: post-state counts
  const finalCanonical = await prisma.sapApiReference.count({
    where: { apiType: "ODATAV4", appliesToPrivate: true },
  });
  const finalReleased = await prisma.sapApiReference.count({
    where: { apiType: "ODATAV4", appliesToPrivate: true, status: "Released" },
  });
  console.log(``);
  console.log(`[canonical-merge] Final state:`);
  console.log(`  apiType=ODATAV4 + appliesToPrivate=true: ${finalCanonical}`);
  console.log(`    of which status=Released:               ${finalReleased}`);
  console.log(``);
  if (finalCanonical !== file.apis.length) {
    console.warn(
      `[canonical-merge] WARN: final canonical count (${finalCanonical}) differs from file (${file.apis.length}). ` +
        `Likely cause: skipDuplicates absorbed some rows. Inspect via Prisma Studio if material.`,
    );
  }

  // Write delta report
  const report: DeltaReport = {
    canonicalCount: file.apis.length,
    fetchedAt: file.fetchedAt,
    fetchedBy: file.fetchedBy,
    source: file.source,
    alreadyInDb: existing.length,
    insertedNew: inserted,
    retaggedToCanonical: retagged,
    heuristicMistagsCleared: heuristicMistags.length,
    heuristicMistagSamples: heuristicMistags.slice(0, 10).map((r) => r.apiId),
    statusBreakdown,
    patternBreakdown,
  };

  mkdirSync("/workspaces/aptus/logs", { recursive: true });
  const md = `# API Hub canonical vs heuristic — delta report

**Generated:** ${new Date().toISOString()}
**Source:** ${file.source}
**Fetched:** ${file.fetchedAt} by ${file.fetchedBy}

## Canonical 424

| Metric | Count |
|---|--:|
| Canonical APIs (file) | ${file.apis.length} |
| Already in DB | ${existing.length} |
| Net-new (inserted) | ${inserted} |
| Existing rows retagged to canonical | ${retagged} |
| Heuristic mis-tags cleared | ${heuristicMistags.length} |

## Status breakdown (canonical)

${Object.entries(statusBreakdown).map(([s, n]) => `- ${s}: ${n}`).join("\n")}

## apiId pattern breakdown (canonical)

${Object.entries(patternBreakdown).sort((a, b) => b[1] - a[1]).map(([p, n]) => `- ${p}: ${n}`).join("\n")}

## Heuristic mis-tags cleared (samples, max 10)

These rows were heuristic-tagged \`apiType=ODATAV4 AND appliesToPrivate=true\`
by the earlier \`refresh-api-types.ts\` pass but are NOT in the canonical
S/4HANA Cloud Private Edition OData V4 list. Their \`apiType\` has been
cleared to NULL — they may still be valid OData v4 APIs, just for a
different edition (Public, On-Prem, or industry add-on).

${heuristicMistags.slice(0, 10).map((r) => `- \`${r.apiId}\``).join("\n")}

## Final state

- \`apiType=ODATAV4 AND appliesToPrivate=true\`: **${finalCanonical}** rows
- of which \`status=Released\`: **${finalReleased}** rows

## Provenance

The endpoint discovered by chrome-claude:

\`\`\`
GET https://api.sap.com/api/1.0/container/SAPS4HANACloudPrivateEdition/artifacts
    ?containerType=product
    &$filter=Type eq 'API' and SubType eq 'ODATAV4'
    &$orderby=ModifiedAt desc
    &$top=1000
\`\`\`

Returns 424 results in a single call — the SPA's "17 pages of 25" was
just UI pagination over this single dataset. Status mapping: ACTIVE →
\`Released\`, DEPRECATED → \`Deprecated\`. No BETA values for this product.

The list endpoint does NOT return \`rawProductCategory\` or
\`scopeItemCodes\` — those would require either a different content-package
endpoint or scraping each \`/api/<id>/overview\` page individually. Both
fields stay null/empty for these rows. Not load-bearing for the brownfield
classifier.

`;
  writeFileSync("/workspaces/aptus/logs/api-hub-canonical-vs-heuristic.md", md);
  console.log(`[canonical-merge] Wrote delta report to logs/api-hub-canonical-vs-heuristic.md`);

  // Also save a JSON variant for programmatic consumption
  writeFileSync(
    "/workspaces/aptus/logs/api-hub-canonical-vs-heuristic.json",
    JSON.stringify(report, null, 2),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[canonical-merge] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
