/**
 * Emit per-item classification prompts for items NOT already verdicted by
 * the rule engine.
 *
 * Output shape per item (logs/brownfield-prompts/<assessmentId>/<itemId>.json):
 *
 *   {
 *     "schemaVersion": 1,
 *     "assessmentId": "<cuid>",
 *     "passId": "<cuid>",
 *     "protocolVersionId": "<cuid>",
 *     "item": { ... item metadata ... },
 *     "narrative": { ... or null ... },
 *     "checks": [ ... ],
 *     "customerFacts": { ... },
 *     "matchingEwaFindings": [ ... ],
 *     "instructions": { systemPrompt, bucketDefinitions, groundingRules },
 *     "expectedResultShape": { ... }
 *   }
 *
 * Also writes index.json (item list) + README.md (workflow instructions).
 *
 * Usage:
 *   $ pnpm tsx scripts/brownfield/emit-classification-prompts.ts --pass-id <passId>
 *   $ pnpm tsx scripts/brownfield/emit-classification-prompts.ts --pass-id <passId> --limit 10
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { prisma } from "../../src/lib/db/prisma";

const SCHEMA_VERSION = 1;

interface ItemBundle {
  itemId: string;
  sapGuid: string;
  sitemId: string;
  titleEn: string;
  applicationArea: string;
  procStatus: string;
  startRelValidFromPrdVer: string | null;
  startRelValidToPrdVer: string | null;
}

interface NarrativeBundle {
  sourceDocument: string;
  applicationComponent: string | null;
  symptomMd: string | null;
  descriptionMd: string | null;
  solutionMd: string | null;
  businessProcessImpactMd: string | null;
  requiredActionMd: string | null;
  relevancyMd: string | null;
  transportBehaviorMd: string | null;
}

/**
 * Heuristic match: an EWA finding is "potentially relevant" to a
 * SimplificationItem if the finding's title shares ≥2 significant words
 * (length > 4) with the item's title or narrative description. Cheap proxy
 * for full semantic search; classifier can disregard if irrelevant.
 */
function findMatchingEwaFindings(
  itemTitle: string,
  itemDescription: string | null,
  ewaFindings: Array<{ id: string; category: string; severity: string; title: string }>,
): Array<{ id: string; category: string; severity: string; title: string; matchingWords: string[] }> {
  const itemBlob = `${itemTitle} ${itemDescription ?? ""}`.toLowerCase();
  const itemWords = new Set(
    itemBlob.split(/\W+/).filter((w) => w.length > 4),
  );
  const out: Array<{ id: string; category: string; severity: string; title: string; matchingWords: string[] }> = [];
  for (const f of ewaFindings) {
    const fWords = f.title.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    const overlap = fWords.filter((w) => itemWords.has(w));
    if (overlap.length >= 2) {
      out.push({ ...f, matchingWords: Array.from(new Set(overlap)) });
    }
  }
  return out;
}

export async function emitClassificationPrompts(
  passId: string,
  options: { limit?: number } = {},
): Promise<{ outDir: string; emitted: number; skipped: number }> {
  const pass = await prisma.brownfieldClassificationPass.findUnique({
    where: { id: passId },
    include: {
      protocolVersion: {
        select: {
          id: true,
          name: true,
          version: true,
          bucketDefinitions: true,
          groundingRules: true,
          systemPrompt: true,
        },
      },
      brownfieldAssessment: {
        select: {
          id: true,
          name: true,
          customerName: true,
          sourceSystemId: true,
          sourceProduct: true,
          sourceDatabase: true,
          sourceProductType: true,
          sourceCountry: true,
          sapInstallationNumber: true,
          targetRelease: true,
        },
      },
    },
  });
  if (!pass) throw new Error(`Pass ${passId} not found`);
  const assessmentId = pass.brownfieldAssessment.id;

  // Items already verdicted in THIS pass (so re-runs only emit the gap)
  const alreadyVerdictedItemIds = new Set(
    (
      await prisma.brownfieldVerdict.findMany({
        where: { passId, isCurrent: true },
        select: { simplificationItemId: true },
      })
    ).map((v) => v.simplificationItemId),
  );

  const items = await prisma.simplificationItem.findMany({
    where: { catalogVersionId: pass.catalogVersionId },
    include: {
      narrative: true,
      checks: true,
    },
    orderBy: [{ applicationArea: "asc" }, { titleEn: "asc" }],
  });

  // Load all EWA findings for this assessment for matching
  const ewaFindings = await prisma.ewaFinding.findMany({
    where: { snapshot: { brownfieldAssessmentId: assessmentId } },
    select: { id: true, category: true, severity: true, title: true },
  });
  console.log(
    `[emit-prompts] Pass ${passId} — ${items.length} items in catalog, ${alreadyVerdictedItemIds.size} already verdicted, ${ewaFindings.length} EWA findings to match against`,
  );

  const outDir = `/workspaces/aptus/logs/brownfield-prompts/${assessmentId}`;
  await mkdir(outDir, { recursive: true });

  let emitted = 0;
  let skipped = 0;
  const indexEntries: Array<{
    file: string;
    itemId: string;
    sitemId: string;
    titleEn: string;
    applicationArea: string;
    hasNarrative: boolean;
  }> = [];

  const limit = options.limit ?? Infinity;

  for (const item of items) {
    if (alreadyVerdictedItemIds.has(item.id)) {
      skipped++;
      continue;
    }
    if (emitted >= limit) break;

    const itemBundle: ItemBundle = {
      itemId: item.id,
      sapGuid: item.sapGuid,
      sitemId: item.sitemId,
      titleEn: item.titleEn,
      applicationArea: item.applicationArea,
      procStatus: item.procStatus,
      startRelValidFromPrdVer: item.startRelValidFromPrdVer,
      startRelValidToPrdVer: item.startRelValidToPrdVer,
    };

    const narrativeBundle: NarrativeBundle | null = item.narrative
      ? {
          sourceDocument: item.narrative.sourceDocument,
          applicationComponent: item.narrative.applicationComponent,
          symptomMd: item.narrative.symptomMd,
          descriptionMd: item.narrative.descriptionMd,
          solutionMd: item.narrative.solutionMd,
          businessProcessImpactMd: item.narrative.businessProcessImpactMd,
          requiredActionMd: item.narrative.requiredActionMd,
          relevancyMd: item.narrative.relevancyMd,
          transportBehaviorMd: item.narrative.transportBehaviorMd,
        }
      : null;

    const matchingFindings = findMatchingEwaFindings(
      item.titleEn,
      narrativeBundle?.descriptionMd ?? narrativeBundle?.symptomMd ?? null,
      ewaFindings,
    );

    const prompt = {
      schemaVersion: SCHEMA_VERSION,
      assessmentId,
      passId,
      protocolVersionId: pass.protocolVersion.id,
      item: itemBundle,
      narrative: narrativeBundle,
      checks: item.checks.map((c) => ({
        id: c.id,
        checkType: c.checkType,
        checkIdentifier: c.checkIdentifier,
        checkSubIdentifier: c.checkSubIdentifier,
        sapNote: c.sapNote,
        checkCountOption: c.checkCountOption,
        checkCount: c.checkCount,
      })),
      customerFacts: {
        customerName: pass.brownfieldAssessment.customerName,
        sourceSystemId: pass.brownfieldAssessment.sourceSystemId,
        sourceProduct: pass.brownfieldAssessment.sourceProduct,
        sourceDatabase: pass.brownfieldAssessment.sourceDatabase,
        sourceProductType: pass.brownfieldAssessment.sourceProductType,
        sourceCountry: pass.brownfieldAssessment.sourceCountry,
        sapInstallationNumber: pass.brownfieldAssessment.sapInstallationNumber,
        targetRelease: pass.brownfieldAssessment.targetRelease,
      },
      matchingEwaFindings: matchingFindings,
      instructions: {
        protocolName: pass.protocolVersion.name,
        protocolVersion: pass.protocolVersion.version,
        bucketDefinitions: pass.protocolVersion.bucketDefinitions,
        groundingRules: pass.protocolVersion.groundingRules,
        systemPrompt: pass.protocolVersion.systemPrompt,
      },
      expectedResultShape: {
        bucket: 'one of: "A" | "C" | "R" | "D" | "N/R" | "B"',
        confidence: 'one of: "high" | "medium" | "low"',
        rationaleMd: "string explaining the choice, citing input fields by name",
        relevantInputs: {
          checkIds: "optional string[]",
          ewaFindingIds: "optional string[]",
          narrativeSections: "optional string[]",
          facts: "optional string[]",
        },
      },
    };

    const fileName = `${item.id}.json`;
    await writeFile(join(outDir, fileName), JSON.stringify(prompt, null, 2));
    indexEntries.push({
      file: fileName,
      itemId: item.id,
      sitemId: item.sitemId,
      titleEn: item.titleEn,
      applicationArea: item.applicationArea,
      hasNarrative: narrativeBundle !== null,
    });
    emitted++;
  }

  await writeFile(
    join(outDir, "index.json"),
    JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        assessmentId,
        passId,
        passProtocol: { name: pass.protocolVersion.name, version: pass.protocolVersion.version },
        totalCatalogItems: items.length,
        alreadyVerdicted: alreadyVerdictedItemIds.size,
        emittedCount: emitted,
        items: indexEntries,
      },
      null,
      2,
    ),
  );

  const readme = `# Brownfield classification — Pass ${passId}

**Assessment:** ${pass.brownfieldAssessment.customerName} (${pass.brownfieldAssessment.sourceSystemId ?? "?"} → ${pass.brownfieldAssessment.targetRelease ?? "S/4HANA"})
**Protocol:** ${pass.protocolVersion.name} v${pass.protocolVersion.version}
**Items emitted:** ${emitted} (out of ${items.length} catalog items; ${alreadyVerdictedItemIds.size} already verdicted by rule engine or prior pass)

## Workflow

1. **Open another Claude Code session in this codespace** (separate window/tab).

2. **Brief Claude:**

   > Read \`logs/brownfield-prompts/${assessmentId}/index.json\` and the per-item
   > files. For each item, follow the systemPrompt + groundingRules in
   > \`instructions\`. Emit a classification verdict with shape
   > matching \`expectedResultShape\`. Write each verdict to
   > \`logs/brownfield-results/${assessmentId}/<itemId>.json\`. Process items
   > in batches; commit progress as you go.

3. **When the second session is done**, return here and run:

   \`\`\`
   pnpm tsx scripts/brownfield/apply-classification-results.ts --pass-id ${passId}
   \`\`\`

   The apply script will write \`BrownfieldVerdict\` rows via the chokepoint
   writer (which enforces frozen-row guards + isCurrent flipping).

4. **Inspect results** at \`/admin/brownfield-assessments/${assessmentId}/verdicts\`.

## Result file shape (each \`<itemId>.json\`)

\`\`\`json
{
  "itemId": "<must match the prompt's item.itemId>",
  "bucket": "A | C | R | D | N/R | B",
  "confidence": "high | medium | low",
  "rationaleMd": "string",
  "relevantInputs": {
    "checkIds": ["..."],
    "ewaFindingIds": ["..."],
    "narrativeSections": ["..."],
    "facts": ["..."]
  }
}
\`\`\`

The apply script validates schema and reports per-file errors.
`;
  await writeFile(join(outDir, "README.md"), readme);

  console.log(`[emit-prompts] Wrote ${emitted} prompt files to ${outDir}`);
  console.log(`[emit-prompts]   index.json + README.md included`);
  console.log(`[emit-prompts]   Skipped ${skipped} already-verdicted items`);
  console.log(`[emit-prompts] Next:`);
  console.log(`  Open another Claude session, classify per ${outDir}/README.md`);
  console.log(`  Then: pnpm tsx scripts/brownfield/apply-classification-results.ts --pass-id ${passId}`);

  return { outDir, emitted, skipped };
}

if (process.argv[1] && process.argv[1].endsWith("emit-classification-prompts.ts")) {
  const args = process.argv.slice(2);
  const passIdx = args.indexOf("--pass-id");
  const passId = passIdx >= 0 ? args[passIdx + 1] : undefined;
  if (!passId) {
    console.error("Usage: tsx scripts/brownfield/emit-classification-prompts.ts --pass-id <passId> [--limit N]");
    process.exit(1);
  }
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number.parseInt(args[limitIdx + 1] ?? "", 10) : undefined;
  const opts: { limit?: number } = {};
  if (limit && Number.isFinite(limit)) opts.limit = limit;
  emitClassificationPrompts(passId, opts)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[emit-prompts] Failed:", err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
