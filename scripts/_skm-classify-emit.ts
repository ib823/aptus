/**
 * SKM classification — emit a batch of pending requirements + per-req
 * Private 2025-FPS1 candidate scope items + top-N matched APIs as evidence.
 *
 * Output: /tmp/skm-batches/skm-batch-<seq>.json — a self-contained JSON
 * file I (Claude Code CLI) work on directly. I read it, classify each
 * requirement against the Private protocol, and write the result file.
 *
 * Then _skm-classify-apply.ts reads the result and persists via writeVerdict.
 *
 * Usage:
 *   npx tsx scripts/_skm-classify-emit.ts --limit 30 --out /tmp/skm-batches/batch-1.json
 *   npx tsx scripts/_skm-classify-emit.ts --module "M16 Procurement Online" --limit 30 --out ...
 */

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

interface CandidateScopeItem {
  scopeItemId: string;  // ScopeItem.id (cuid for Private) — for FK-validated citation in apply step
  scopeCode: string;    // "J60" — for human readability in classification
  name: string;
  functionalArea: string | null;
  totalSteps: number;
}

interface ApiEvidence {
  apiId: string;
  apiName: string;
  status: string;
  scopeItemCodes: string[];
}

interface RequirementInBatch {
  requirementId: string;
  module: string;
  code: string;
  priorityTier: string | null;
  requirementText: string;
  candidates: CandidateScopeItem[];
  matchedApis: ApiEvidence[];
}

interface EmitFile {
  schemaVersion: 1;
  passId: string;
  protocolVersionId: string;
  protocolSystemPrompt: string;
  catalogVersion: string;
  catalogEdition: string;
  assessmentId: string;
  assessmentCompany: string;
  batch: {
    seq: number;
    size: number;
    filterDescription: string;
  };
  requirements: RequirementInBatch[];
}

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main(): Promise<void> {
  const limit = arg("limit") ? parseInt(arg("limit")!, 10) : 30;
  const moduleFilter = arg("module");
  const outPath = arg("out");
  if (!outPath) throw new Error("--out is required");

  const skm = await prisma.assessment.findFirst({
    where: { companyName: "Suruhanjaya Koperasi Malaysia", deletedAt: null },
    select: { id: true, companyName: true, catalogVersion: { select: { id: true, version: true, edition: true } } },
  });
  if (!skm || !skm.catalogVersion) throw new Error("SKM assessment or catalog missing");

  const pass = await prisma.classificationPass.findFirst({
    where: { assessmentId: skm.id, completedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, protocolVersionId: true, protocolVersion: { select: { systemPrompt: true } } },
  });
  if (!pass) throw new Error("No active pass — run _skm-classify-init.ts first");

  // Find pending reqs (no current verdict for this pass yet)
  const where: {
    assessmentId: string;
    module?: string;
    NOT?: { verdicts: { some: { passId: string } } };
  } = {
    assessmentId: skm.id,
    // Skip reqs that already have a verdict in THIS pass
    NOT: { verdicts: { some: { passId: pass.id } } },
  };
  if (moduleFilter) where.module = moduleFilter;

  const reqs = await prisma.clientRequirement.findMany({
    where,
    select: {
      id: true,
      module: true,
      code: true,
      priorityTier: true,
      requirementText: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
    take: limit,
  });

  if (reqs.length === 0) {
    console.log("No pending requirements left for this pass.");
    await prisma.$disconnect();
    return;
  }

  // Pull all Private 2025-FPS1 scope items for keyword-matching candidates
  const allItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId: skm.catalogVersion.id },
    select: { id: true, scopeCode: true, name: true, functionalArea: true, totalSteps: true },
  });

  function pickCandidates(req: { module: string; requirementText: string }): CandidateScopeItem[] {
    const kw = new Set<string>();
    for (const w of (req.requirementText.toLowerCase().match(/[a-z]{4,}/g) ?? []).slice(0, 25)) kw.add(w);
    kw.add(req.module.toLowerCase());
    const scored = allItems.map((it) => {
      const hay = (it.name + " " + (it.functionalArea ?? "")).toLowerCase();
      let s = 0;
      for (const k of kw) if (hay.includes(k)) s++;
      return { it, s };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored
      .slice(0, 12)
      .filter((x) => x.s > 0)
      .map((x) => ({
        scopeItemId: x.it.id,
        scopeCode: x.it.scopeCode,
        name: x.it.name,
        functionalArea: x.it.functionalArea,
        totalSteps: x.it.totalSteps,
      }));
  }

  // Pull SAP API evidence per batch (Private + Released, scope-overlap with candidates)
  async function pickApis(candidateCodes: string[]): Promise<ApiEvidence[]> {
    if (candidateCodes.length === 0) return [];
    const apis = await prisma.sapApiReference.findMany({
      where: {
        appliesToPrivate: true,
        status: "Released",
        scopeItemCodes: { hasSome: candidateCodes },
      },
      select: { apiId: true, apiName: true, status: true, scopeItemCodes: true },
    });
    const wanted = new Set(candidateCodes);
    const scored = apis.map((a) => {
      let overlap = 0;
      for (const c of a.scopeItemCodes) if (wanted.has(c)) overlap++;
      return { a, overlap };
    });
    scored.sort((a, b) => b.overlap - a.overlap || a.a.apiName.localeCompare(b.a.apiName));
    return scored.slice(0, 8).map((s) => s.a);
  }

  const enriched: RequirementInBatch[] = [];
  for (const r of reqs) {
    const candidates = pickCandidates(r);
    const apis = await pickApis(candidates.map((c) => c.scopeCode));
    enriched.push({
      requirementId: r.id,
      module: r.module,
      code: r.code,
      priorityTier: r.priorityTier,
      requirementText: r.requirementText,
      candidates,
      matchedApis: apis,
    });
  }

  // Determine the batch sequence from the existing batches in the dir
  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });
  const existingFiles = fs.readdirSync(dir).filter((f) => f.startsWith("skm-batch-") && f.endsWith(".json"));
  const seq = existingFiles.length + 1;

  const file: EmitFile = {
    schemaVersion: 1,
    passId: pass.id,
    protocolVersionId: pass.protocolVersionId,
    protocolSystemPrompt: pass.protocolVersion.systemPrompt,
    catalogVersion: skm.catalogVersion.version,
    catalogEdition: skm.catalogVersion.edition,
    assessmentId: skm.id,
    assessmentCompany: skm.companyName,
    batch: {
      seq,
      size: enriched.length,
      filterDescription: moduleFilter ? `module=${moduleFilter}` : "all pending",
    },
    requirements: enriched,
  };

  fs.writeFileSync(outPath, JSON.stringify(file, null, 2));
  console.log(`emit: batch ${seq} → ${enriched.length} reqs → ${outPath}`);
  console.log(`  bytes: ${fs.statSync(outPath).size.toLocaleString()}`);
  console.log(`  pass: ${pass.id}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
