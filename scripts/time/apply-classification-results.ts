/**
 * TIME RFT Phase 8 — apply classifier results back into ClassificationVerdict
 * + ClientRequirement read-cache columns.
 *
 * Reads per-batch result JSONs from logs/time-results/<assessmentId>/
 * batch-NNN.json. Each result file shape:
 *   {
 *     "schemaVersion": 1,
 *     "passId": "<cuid>",
 *     "batchIndex": <int>,
 *     "results": [
 *       {
 *         "requirementId": "<cuid>",
 *         "classification": "O - Out Of The Box" | "C - Configuration" |
 *                           "G - Gap" | "N/A - Out of Scope",
 *         "matchedScopeItems": ["scopeCode1", ...],
 *         "remarks": "string",
 *         "erpModuleSupporting": "string (or controlled vocab)",
 *         "confidence": "high" | "medium" | "low",
 *         "matchedSimplificationItems": ["sapGuid1", ...] (optional),
 *         "matchedCustomerProcessIds": ["procId1", ...] (optional)
 *       },
 *       ...
 *     ]
 *   }
 *
 * Writes via the verdict-writer chokepoint (frozen-row guard, append-only,
 * scope-citation FK enforcement). Idempotent.
 *
 * Usage:
 *   $ pnpm tsx scripts/time/apply-classification-results.ts --pass-id <passId>
 *   $ pnpm tsx scripts/time/apply-classification-results.ts --pass-id <passId> --results-dir <path>
 */

import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { prisma } from "../../src/lib/db/prisma";

const VALID_CLASSIFICATIONS = new Set([
  "O - Out Of The Box",
  "C - Configuration",
  "G - Gap",
  "N/A - Out of Scope",
]);
const VALID_CONFIDENCES = new Set(["high", "medium", "low"]);

interface ResultEntry {
  requirementId: string;
  classification: string;
  matchedScopeItems?: string[];
  remarks: string;
  erpModuleSupporting?: string;
  confidence?: string;
  matchedSimplificationItems?: string[];
  matchedCustomerProcessIds?: string[];
}

interface BatchFile {
  schemaVersion: number;
  passId: string;
  batchIndex: number;
  results: ResultEntry[];
}

interface FileError {
  file: string;
  reason: string;
}

function shortClassification(full: string): string {
  // Convert "O - Out Of The Box" -> "O", etc., for the legacy
  // ClientRequirement.solutionProviderResponse column
  if (full.startsWith("O")) return "O";
  if (full.startsWith("C")) return "C";
  if (full.startsWith("G")) return "G";
  return "N/A";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const passIdx = args.indexOf("--pass-id");
  const dirIdx = args.indexOf("--results-dir");
  const passId = passIdx >= 0 ? args[passIdx + 1] : undefined;
  if (!passId) {
    console.error("Usage: tsx scripts/time/apply-classification-results.ts --pass-id <passId> [--results-dir PATH]");
    process.exit(1);
  }

  const pass = await prisma.classificationPass.findUnique({
    where: { id: passId },
    include: {
      assessment: { select: { id: true, status: true, companyName: true, catalogVersionId: true } },
      protocolVersion: { select: { id: true, name: true, version: true } },
    },
  });
  if (!pass) throw new Error(`Pass ${passId} not found`);
  if (pass.assessment.status === "signed_off") {
    throw new Error(`Assessment is signed_off — refusing to apply. Unseal first.`);
  }

  const resultsDir =
    dirIdx >= 0 && args[dirIdx + 1]
      ? args[dirIdx + 1]!
      : `/workspaces/aptus/logs/time-results/${pass.assessment.id}`;
  console.log(`[time-apply] Pass: ${pass.id} (${pass.protocolVersion.name} v${pass.protocolVersion.version})`);
  console.log(`[time-apply] Assessment: ${pass.assessment.id} (${pass.assessment.companyName})`);
  console.log(`[time-apply] Results dir: ${resultsDir}`);

  let entries: string[];
  try {
    entries = await readdir(resultsDir);
  } catch (err) {
    throw new Error(
      `Results directory not found: ${resultsDir}. Did you run emit + classify in another Claude session? ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const batchFiles = entries
    .filter((e) => e.startsWith("batch-") && e.endsWith(".json"))
    .sort();
  console.log(`[time-apply] Found ${batchFiles.length} batch files`);

  // Load valid scope codes for FK validation
  const scopeItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId: pass.assessment.catalogVersionId! },
    select: { id: true, scopeCode: true },
  });
  const scopeCodeToId = new Map(scopeItems.map((s) => [s.scopeCode, s.id]));
  const validRequirementIds = new Set(
    (await prisma.clientRequirement.findMany({
      where: { assessmentId: pass.assessment.id },
      select: { id: true },
    })).map((r) => r.id),
  );

  let applied = 0;
  let skipped = 0;
  const errors: FileError[] = [];

  for (const file of batchFiles) {
    const fullPath = join(resultsDir, file);
    try {
      const stats = await stat(fullPath);
      if (!stats.isFile()) { skipped++; continue; }
      const text = await readFile(fullPath, "utf8");
      const parsed = JSON.parse(text) as BatchFile;
      if (parsed.passId !== passId) {
        errors.push({ file, reason: `Pass ID mismatch: file says ${parsed.passId}, expected ${passId}` });
        continue;
      }

      for (const r of parsed.results) {
        if (!validRequirementIds.has(r.requirementId)) {
          errors.push({ file, reason: `requirementId ${r.requirementId} not in this assessment` });
          continue;
        }
        if (!VALID_CLASSIFICATIONS.has(r.classification)) {
          errors.push({ file, reason: `Invalid classification "${r.classification}" for ${r.requirementId}` });
          continue;
        }
        if (r.confidence && !VALID_CONFIDENCES.has(r.confidence)) {
          errors.push({ file, reason: `Invalid confidence "${r.confidence}" for ${r.requirementId}` });
          continue;
        }
        if (typeof r.remarks !== "string" || r.remarks.length === 0) {
          errors.push({ file, reason: `Missing remarks for ${r.requirementId}` });
          continue;
        }

        // Resolve scope codes to ids (FK-safe)
        const matchedScopeIds: string[] = [];
        for (const code of r.matchedScopeItems ?? []) {
          const id = scopeCodeToId.get(code);
          if (id) matchedScopeIds.push(id);
        }

        // Mark prior current verdict for this requirement as not current
        await prisma.classificationVerdict.updateMany({
          where: { requirementId: r.requirementId, isCurrent: true },
          data: { isCurrent: false },
        });

        // Insert new verdict
        const verdict = await prisma.classificationVerdict.create({
          data: {
            requirementId: r.requirementId,
            passId: pass.id,
            protocolVersionId: pass.protocolVersionId,
            verdict: r.classification,
            confidence: r.confidence ?? null,
            sapModule: r.erpModuleSupporting ?? null,
            remarksMd: r.remarks,
            actor: "claude-cli",
            source: "AI",
            isCurrent: true,
          },
        });

        // Write VerdictScopeItem citations
        if (matchedScopeIds.length > 0) {
          await prisma.verdictScopeItem.createMany({
            data: matchedScopeIds.map((sid, idx) => ({
              verdictId: verdict.id,
              scopeItemId: sid,
              role: idx === 0 ? "primary" : "secondary",
            })),
            skipDuplicates: true,
          });
        }

        // Update ClientRequirement read-cache columns (dual-write per AD-1)
        await prisma.clientRequirement.update({
          where: { id: r.requirementId },
          data: {
            currentVerdictId: verdict.id,
            solutionProviderResponse: shortClassification(r.classification),
            solutionProviderRemarks: r.remarks,
            erpModuleSupporting: r.erpModuleSupporting ?? null,
            sapModule: r.erpModuleSupporting ?? null,
            scopeItemIds: (r.matchedScopeItems ?? []).join(", "),
          },
        });
        applied++;
      }
    } catch (err) {
      errors.push({ file, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  // Update pass.summaryJson + completedAt
  const final = await prisma.classificationVerdict.groupBy({
    by: ["verdict"],
    where: { passId: pass.id, isCurrent: true },
    _count: { id: true },
  });
  const distribution: Record<string, number> = {};
  for (const f of final) distribution[f.verdict] = f._count.id;
  await prisma.classificationPass.update({
    where: { id: pass.id },
    data: {
      completedAt: new Date(),
      summaryJson: {
        distribution,
        totalApplied: applied,
        errors: errors.length,
      },
    },
  });

  console.log(``);
  console.log(`[time-apply] Done.`);
  console.log(`  Applied  : ${applied}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors.length}`);
  if (errors.length > 0) {
    console.log(`  First 5 errors:`);
    for (const e of errors.slice(0, 5)) console.log(`    - ${e.file}: ${e.reason}`);
  }
  console.log(`  Distribution: ${JSON.stringify(distribution)}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[time-apply] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
