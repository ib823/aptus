/**
 * TIME RFT Phase 7-8 — emit dual-catalog classification prompts for the
 * 834 TIME requirements. Each prompt bundles ALL evidence the classifier
 * needs:
 *   - The requirement itself
 *   - Top-N greenfield ScopeItem candidates (PRIVATE 2025-FPS1)
 *   - Top-N brownfield SImplification Items (May 2026 SIC) — with narrative
 *   - Linked CustomerProcess rows (App 2(b) page-anchored)
 *   - EWA findings (heuristic-matched by category)
 *   - Conversion Guide section refs
 *   - SAP API references (PRIVATE OData v4)
 *   - SAP Activate methodology phase context
 *
 * Outputs per-batch JSON files to logs/time-prompts/<assessmentId>/
 * for processing in another Claude Code session via the proven
 * SKM-style emit/apply pattern.
 *
 * Usage:
 *   $ pnpm tsx scripts/time/emit-classification-prompts.ts
 *   $ pnpm tsx scripts/time/emit-classification-prompts.ts --batch-size 50 --module Finance
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { prisma } from "../../src/lib/db/prisma";

const ASSESSMENT_COMPANY = "T.I.M.E. dotCom Bhd";
const PROTOCOL_NAME = "TIME bid baseline";
const PROTOCOL_VERSION = "1.0.0";
const SCHEMA_VERSION = 1;

const STOP_WORDS = new Set([
  "the", "shall", "should", "will", "must", "may", "can", "and", "or", "but",
  "for", "with", "from", "into", "onto", "this", "that", "these", "those",
  "support", "supports", "supported", "ensure", "ensures", "provide", "provides",
  "provided", "system", "solution", "solutions", "process", "processes",
  "have", "has", "been", "being", "their", "there", "where", "when", "what",
  "all", "any", "some", "such", "each", "every", "other", "another",
  "implement", "implementation", "implemented", "manage", "management", "managed",
  "include", "includes", "included", "including", "able", "ability",
  "user", "users", "data", "information",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4 && !STOP_WORDS.has(w)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let c = 0;
  for (const x of a) if (b.has(x)) c++;
  return c;
}

interface CmdArgs {
  batchSize?: number;
  module?: string;
  limit?: number;
}

function parseArgs(): CmdArgs {
  const args = process.argv.slice(2);
  const out: CmdArgs = {};
  const bs = args.indexOf("--batch-size");
  const mo = args.indexOf("--module");
  const li = args.indexOf("--limit");
  if (bs >= 0 && args[bs + 1]) out.batchSize = Number(args[bs + 1]);
  const mv = mo >= 0 ? args[mo + 1] : undefined;
  if (mv) out.module = mv;
  if (li >= 0 && args[li + 1]) out.limit = Number(args[li + 1]);
  return out;
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const batchSize = opts.batchSize ?? 25;

  const assessment = await prisma.assessment.findFirst({
    where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
    select: { id: true, catalogVersionId: true, brownfieldCatalogVersionId: true, companyName: true },
  });
  if (!assessment) throw new Error(`Assessment for ${ASSESSMENT_COMPANY} not found`);
  if (!assessment.catalogVersionId) throw new Error("greenfield catalog missing");
  if (!assessment.brownfieldCatalogVersionId) throw new Error("brownfield catalog missing");

  const protocol = await prisma.classificationProtocol.findUnique({
    where: { name_version: { name: PROTOCOL_NAME, version: PROTOCOL_VERSION } },
  });
  if (!protocol) throw new Error("TIME protocol not seeded — run seed-time-protocol.ts first");

  console.log(`[time-emit] Assessment: ${assessment.id} (${assessment.companyName})`);
  console.log(`[time-emit] Protocol  : ${protocol.id} (${protocol.name} v${protocol.version})`);
  console.log(`[time-emit] Greenfield catalog: ${assessment.catalogVersionId}`);
  console.log(`[time-emit] Brownfield catalog: ${assessment.brownfieldCatalogVersionId}`);

  // Create a ClassificationPass row to anchor the verdicts
  const pass = await prisma.classificationPass.create({
    data: {
      assessmentId: assessment.id,
      protocolVersionId: protocol.id,
      catalogVersionId: assessment.catalogVersionId,
      actor: "orchestrator",
      actorRole: "orchestrator",
    },
  });
  console.log(`[time-emit] Created ClassificationPass: ${pass.id}`);

  // Load all requirements (filtered if --module given)
  const reqWhere: { assessmentId: string; module?: string } = { assessmentId: assessment.id };
  if (opts.module) reqWhere.module = opts.module;
  const requirements = await prisma.clientRequirement.findMany({
    where: reqWhere,
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true, code: true, module: true, section: true,
      requirementText: true, requirementType: true,
      clientRemarks: true, erpModuleSupporting: true,
      sapModule: true, sortOrder: true,
    },
  });
  const reqsToProcess = opts.limit ? requirements.slice(0, opts.limit) : requirements;
  console.log(`[time-emit] Will emit ${reqsToProcess.length} requirements (of ${requirements.length} total)`);

  // Pre-load all catalog evidence sources (cached for the whole pass)
  const greenfieldItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId: assessment.catalogVersionId },
    select: { id: true, scopeCode: true, name: true, nameClean: true, functionalArea: true, subArea: true, totalSteps: true, purposeHtml: true },
  });
  const greenfieldTokens = greenfieldItems.map((g) => ({
    item: g,
    tokens: new Set([...tokenize(g.nameClean), ...tokenize(g.functionalArea ?? ""), ...tokenize(g.subArea ?? "")]),
  }));

  const brownfieldItems = await prisma.simplificationItem.findMany({
    where: { catalogVersionId: assessment.brownfieldCatalogVersionId, procStatus: "R" },
    include: {
      narrative: { select: { symptomMd: true, descriptionMd: true, requiredActionMd: true, applicationComponent: true } },
    },
  });
  const brownfieldTokens = brownfieldItems.map((b) => ({
    item: b,
    tokens: new Set([...tokenize(b.titleEn), ...tokenize(b.applicationArea)]),
  }));

  const ewaFindings = await prisma.ewaFinding.findMany({
    where: { snapshot: { brownfieldAssessment: { customerName: { contains: "TT dotCom" } } } },
    select: { id: true, title: true, category: true, severity: true, description: true },
  });
  const ewaTokens = ewaFindings.map((e) => ({ finding: e, tokens: tokenize(e.title) }));

  const apis = await prisma.sapApiReference.findMany({
    where: { apiType: "ODATAV4", appliesToPrivate: true, status: "Released" },
    select: { id: true, apiId: true, apiName: true, description: true, category: true },
  });
  const apiTokens = apis.map((a) => ({ api: a, tokens: tokenize(a.apiName) }));

  // Pre-load process links per requirement
  const processLinks = await prisma.customerProcessRequirementLink.findMany({
    where: { requirement: { assessmentId: assessment.id } },
    include: { customerProcess: { include: { evidenceLinks: true } } },
  });
  const processLinksByReq = new Map<string, typeof processLinks>();
  for (const pl of processLinks) {
    const list = processLinksByReq.get(pl.requirementId) ?? [];
    list.push(pl);
    processLinksByReq.set(pl.requirementId, list);
  }

  // Output directory
  const outDir = `/workspaces/aptus/logs/time-prompts/${assessment.id}`;
  await mkdir(outDir, { recursive: true });

  let batchIdx = 0;
  const indexEntries: Array<{ batch: string; requirementCount: number; firstCode: string; lastCode: string }> = [];

  for (let i = 0; i < reqsToProcess.length; i += batchSize) {
    const batch = reqsToProcess.slice(i, i + batchSize);
    batchIdx++;
    const batchPath = join(outDir, `batch-${String(batchIdx).padStart(3, "0")}.json`);

    const batchPrompts = batch.map((req) => {
      const reqTokens = tokenize(req.requirementText);

      // GREENFIELD: top-15 by score (name overlap × 3 + area overlap)
      const gfScored = greenfieldTokens
        .map((g) => ({ ...g, score: overlap(reqTokens, g.tokens) }))
        .filter((s) => s.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

      // BROWNFIELD: top-10 by score (only if ≥1 overlap)
      const bfScored = brownfieldTokens
        .map((b) => ({ ...b, score: overlap(reqTokens, b.tokens) }))
        .filter((s) => s.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      // Process links for this requirement
      const links = processLinksByReq.get(req.id) ?? [];
      const linkedProcesses = links.slice(0, 5).map((l) => ({
        processId: l.customerProcess.id,
        processName: l.customerProcess.processName,
        parentSection: l.customerProcess.parentSection,
        pageRefs: l.customerProcess.pageRefs,
        sourceSystems: l.customerProcess.sourceSystems,
        painPoints: l.customerProcess.painPoints.slice(0, 3),
        linkConfidence: l.confidence,
        linkRationale: l.rationale,
      }));

      // EWA: top-3 by overlap
      const ewaScored = ewaTokens
        .map((e) => ({ ...e, score: overlap(reqTokens, e.tokens) }))
        .filter((s) => s.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      // APIs: top-5
      const apiScored = apiTokens
        .map((a) => ({ ...a, score: overlap(reqTokens, a.tokens) }))
        .filter((s) => s.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      return {
        requirement: {
          id: req.id,
          code: req.code,
          module: req.module,
          section: req.section,
          requirementText: req.requirementText,
          requirementType: req.requirementType,
          docRefHint: req.clientRemarks,
          solutionOptionsHint: req.erpModuleSupporting,
          sapModulePreTag: req.sapModule,
        },
        candidateGreenfieldScopeItems: gfScored.map((s) => ({
          id: s.item.id,
          scopeCode: s.item.scopeCode,
          nameClean: s.item.nameClean,
          functionalArea: s.item.functionalArea,
          totalSteps: s.item.totalSteps,
          score: s.score,
        })),
        relevantBrownfieldSimplificationItems: bfScored.map((s) => ({
          sapGuid: s.item.sapGuid,
          sitemId: s.item.sitemId,
          titleEn: s.item.titleEn,
          applicationArea: s.item.applicationArea,
          narrativeSummary: s.item.narrative
            ? [s.item.narrative.symptomMd, s.item.narrative.descriptionMd, s.item.narrative.requiredActionMd]
                .filter(Boolean).join(" ").slice(0, 800)
            : null,
          score: s.score,
        })),
        customerAsIsProcesses: linkedProcesses,
        customerEwaFindings: ewaScored.map((s) => ({
          id: s.finding.id,
          title: s.finding.title,
          category: s.finding.category,
          severity: s.finding.severity,
        })),
        candidateApis: apiScored.map((s) => ({
          apiId: s.api.apiId,
          apiName: s.api.apiName,
          category: s.api.category,
        })),
      };
    });

    const batchDoc = {
      schemaVersion: SCHEMA_VERSION,
      assessmentId: assessment.id,
      assessmentCompany: assessment.companyName,
      passId: pass.id,
      protocolVersionId: protocol.id,
      protocolName: protocol.name,
      protocolVersion: protocol.version,
      batchIndex: batchIdx,
      batchSize: batch.length,
      groundingRules: protocol.groundingRules,
      systemPrompt: protocol.systemPrompt,
      bucketDefinitions: protocol.bucketDefinitions,
      requirements: batchPrompts,
    };

    await writeFile(batchPath, JSON.stringify(batchDoc, null, 2));
    indexEntries.push({
      batch: `batch-${String(batchIdx).padStart(3, "0")}.json`,
      requirementCount: batch.length,
      firstCode: batch[0]!.code,
      lastCode: batch[batch.length - 1]!.code,
    });
    console.log(`[time-emit] Wrote ${batchPath} (${batch.length} reqs, ${batch[0]!.code} → ${batch[batch.length - 1]!.code})`);
  }

  // Index file
  await writeFile(join(outDir, "index.json"), JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    assessmentId: assessment.id,
    passId: pass.id,
    totalRequirements: reqsToProcess.length,
    batches: indexEntries,
  }, null, 2));

  // README
  const readme = `# TIME RFT classification prompts — Pass ${pass.id}

**Customer:** TIME (T.I.M.E. dotCom Bhd) — RFT 26.069
**Protocol:** ${protocol.name} v${protocol.version}
**Total requirements:** ${reqsToProcess.length} in ${indexEntries.length} batches of ${batchSize}

## Workflow

1. **Open another Claude Code session** in this codespace.

2. **Brief Claude:**

   > Read \`logs/time-prompts/${assessment.id}/index.json\` and process each
   > batch file. For each requirement in each batch:
   >
   > - Read the GROUNDING RULES + SYSTEM PROMPT (in each batch's \`groundingRules\`
   >   and \`systemPrompt\` fields)
   > - Apply the DECISION LADDER from the GROUNDING RULES
   > - Emit a verdict in the JSON shape specified in SYSTEM PROMPT
   > - Save batch results to \`logs/time-results/${assessment.id}/batch-NNN.json\`
   >   with shape \`{ batchIndex, results: [ { requirementId, classification, ... } ] }\`
   >
   > Process batches in order (001, 002, 003, ...). After each batch, save
   > the result file before moving on (in case of crash).

3. **When done**, return to this session and run:

   \`\`\`
   pnpm tsx scripts/time/apply-classification-results.ts --pass-id ${pass.id}
   \`\`\`

   The apply script writes \`ClassificationVerdict\` rows via the
   verdict-writer chokepoint.

4. **Inspect verdicts** at \`/admin/assessments/${assessment.id}\` (existing
   greenfield admin page) or via Prisma Studio.
`;
  await writeFile(join(outDir, "README.md"), readme);

  console.log(``);
  console.log(`[time-emit] Done.`);
  console.log(`  Pass id          : ${pass.id}`);
  console.log(`  Output dir       : ${outDir}`);
  console.log(`  Batches written  : ${indexEntries.length} of ${batchSize} reqs each`);
  console.log(`  Total requirements: ${reqsToProcess.length}`);
  console.log(``);
  console.log(`Next: open another Claude session, see ${outDir}/README.md`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[time-emit] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
