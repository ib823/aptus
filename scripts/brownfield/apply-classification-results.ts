/**
 * Read result JSON files written by another Claude Code session and
 * persist them as BrownfieldVerdict rows via the chokepoint writer.
 *
 * Result file shape (per item):
 *   {
 *     "itemId": "<simplificationItem.id>",
 *     "bucket": "A | C | R | D | N/R | B",
 *     "confidence": "high | medium | low" (optional),
 *     "rationaleMd": "string",
 *     "relevantInputs": { ... } (optional)
 *   }
 *
 * Idempotent: a result file processed twice writes a second verdict (the
 * chokepoint flips the prior current to false). Re-runs reflect the latest
 * result-file state.
 *
 * Usage:
 *   $ pnpm tsx scripts/brownfield/apply-classification-results.ts --pass-id <passId>
 *   $ pnpm tsx scripts/brownfield/apply-classification-results.ts \
 *       --pass-id <passId> \
 *       --results-dir /custom/path/to/results
 */

import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { prisma } from "../../src/lib/db/prisma";
import { writeBrownfieldVerdict, type VerdictBucket, type VerdictConfidence } from "../../src/lib/brownfield/verdict-writer";

const VALID_BUCKETS = new Set(["A", "C", "R", "D", "N/R", "B"]);
const VALID_CONFIDENCES = new Set(["high", "medium", "low"]);

interface ResultFile {
  itemId: string;
  bucket: VerdictBucket;
  confidence?: VerdictConfidence;
  rationaleMd: string;
  relevantInputs?: Record<string, unknown>;
}

interface FileError {
  file: string;
  reason: string;
}

function validate(parsed: unknown, file: string): { ok: true; data: ResultFile } | { ok: false; error: string } {
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "JSON root is not an object" };
  }
  const r = parsed as Record<string, unknown>;
  if (typeof r.itemId !== "string" || r.itemId.length === 0) {
    return { ok: false, error: "Missing or invalid 'itemId'" };
  }
  if (typeof r.bucket !== "string" || !VALID_BUCKETS.has(r.bucket)) {
    return {
      ok: false,
      error: `Invalid 'bucket': ${JSON.stringify(r.bucket)}. Must be one of: ${Array.from(VALID_BUCKETS).join(", ")}`,
    };
  }
  if (r.confidence !== undefined && r.confidence !== null && !VALID_CONFIDENCES.has(String(r.confidence))) {
    return {
      ok: false,
      error: `Invalid 'confidence': ${JSON.stringify(r.confidence)}. Must be one of: ${Array.from(VALID_CONFIDENCES).join(", ")} or omitted.`,
    };
  }
  if (typeof r.rationaleMd !== "string" || r.rationaleMd.length === 0) {
    return { ok: false, error: "Missing or invalid 'rationaleMd' (must be non-empty string)" };
  }
  void file;
  return {
    ok: true,
    data: {
      itemId: r.itemId,
      bucket: r.bucket as VerdictBucket,
      ...(r.confidence ? { confidence: r.confidence as VerdictConfidence } : {}),
      rationaleMd: r.rationaleMd,
      ...(r.relevantInputs && typeof r.relevantInputs === "object"
        ? { relevantInputs: r.relevantInputs as Record<string, unknown> }
        : {}),
    },
  };
}

export async function applyClassificationResults(
  passId: string,
  options: { resultsDir?: string; actor?: string } = {},
): Promise<{ applied: number; skipped: number; errors: FileError[] }> {
  const pass = await prisma.brownfieldClassificationPass.findUnique({
    where: { id: passId },
    include: {
      brownfieldAssessment: { select: { id: true, status: true } },
    },
  });
  if (!pass) throw new Error(`Pass ${passId} not found`);
  if (pass.brownfieldAssessment.status === "signed_off") {
    throw new Error(
      `BrownfieldAssessment ${pass.brownfieldAssessment.id} is signed_off — refusing to apply results. Unseal first.`,
    );
  }

  const assessmentId = pass.brownfieldAssessment.id;
  const resultsDir =
    options.resultsDir ?? `/workspaces/aptus/logs/brownfield-results/${assessmentId}`;

  let entries: string[];
  try {
    entries = await readdir(resultsDir);
  } catch (err) {
    throw new Error(
      `Results directory not found: ${resultsDir}. Did you run emit-classification-prompts.ts and process the prompts? Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const jsonFiles = entries.filter((e) => e.endsWith(".json") && e !== "index.json");
  console.log(`[apply-results] Found ${jsonFiles.length} result files in ${resultsDir}`);

  // Build the set of valid item ids for this catalog so we can error on
  // results that reference items not in the pinned catalog.
  const validItemIds = new Set(
    (
      await prisma.simplificationItem.findMany({
        where: { catalogVersionId: pass.catalogVersionId },
        select: { id: true },
      })
    ).map((i) => i.id),
  );

  const actor = options.actor ?? "claude-cli";
  let applied = 0;
  let skipped = 0;
  const errors: FileError[] = [];

  for (const file of jsonFiles) {
    const fullPath = join(resultsDir, file);
    try {
      const stats = await stat(fullPath);
      if (!stats.isFile()) {
        skipped++;
        continue;
      }
      const text = await readFile(fullPath, "utf8");
      const parsed = JSON.parse(text) as unknown;
      const validated = validate(parsed, file);
      if (!validated.ok) {
        errors.push({ file, reason: validated.error });
        continue;
      }
      if (!validItemIds.has(validated.data.itemId)) {
        errors.push({
          file,
          reason: `itemId "${validated.data.itemId}" is not in the pass's catalog (${pass.catalogVersionId})`,
        });
        continue;
      }
      await writeBrownfieldVerdict({
        brownfieldAssessmentId: assessmentId,
        simplificationItemId: validated.data.itemId,
        passId,
        protocolVersionId: pass.protocolVersionId,
        bucket: validated.data.bucket,
        ...(validated.data.confidence ? { confidence: validated.data.confidence } : {}),
        rationaleMd: validated.data.rationaleMd,
        ...(validated.data.relevantInputs ? { relevantInputs: validated.data.relevantInputs } : {}),
        actor,
        source: "CLAUDE_CLI",
      });
      applied++;
    } catch (err) {
      errors.push({
        file,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Refresh pass.summaryJson with the post-apply distribution
  const finalCounts = await prisma.brownfieldVerdict.groupBy({
    by: ["bucket"],
    where: { passId, isCurrent: true },
    _count: { id: true },
  });
  const byBucket: Record<string, number> = { A: 0, C: 0, R: 0, D: 0, "N/R": 0, B: 0 };
  for (const c of finalCounts) byBucket[c.bucket] = c._count.id;
  const sourceCounts = await prisma.brownfieldVerdict.groupBy({
    by: ["source"],
    where: { passId, isCurrent: true },
    _count: { id: true },
  });
  const bySource: Record<string, number> = {};
  for (const c of sourceCounts) bySource[c.source] = c._count.id;

  const totalCurrentVerdicts = Object.values(byBucket).reduce((s, n) => s + n, 0);

  await prisma.brownfieldClassificationPass.update({
    where: { id: passId },
    data: {
      summaryJson: {
        ...((pass.summaryJson as Record<string, unknown>) ?? {}),
        applyCompletedAt: new Date().toISOString(),
        currentVerdicts: totalCurrentVerdicts,
        byBucket,
        bySource,
        lastApply: { applied, skipped, errors: errors.length },
      },
    },
  });

  console.log(`[apply-results] Done.`);
  console.log(`  Applied  : ${applied}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors.length}`);
  if (errors.length > 0) {
    console.log(`  First 5 errors:`);
    for (const e of errors.slice(0, 5)) {
      console.log(`    - ${e.file}: ${e.reason}`);
    }
  }
  console.log(`[apply-results] Pass distribution now: ${JSON.stringify(byBucket)}`);
  console.log(`[apply-results] Sources: ${JSON.stringify(bySource)}`);
  return { applied, skipped, errors };
}

if (process.argv[1] && process.argv[1].endsWith("apply-classification-results.ts")) {
  const args = process.argv.slice(2);
  const passIdx = args.indexOf("--pass-id");
  const passId = passIdx >= 0 ? args[passIdx + 1] : undefined;
  if (!passId) {
    console.error("Usage: tsx scripts/brownfield/apply-classification-results.ts --pass-id <passId> [--results-dir PATH] [--actor NAME]");
    process.exit(1);
  }
  const dirIdx = args.indexOf("--results-dir");
  const actorIdx = args.indexOf("--actor");
  const opts: { resultsDir?: string; actor?: string } = {};
  const dirVal = dirIdx >= 0 ? args[dirIdx + 1] : undefined;
  const actorVal = actorIdx >= 0 ? args[actorIdx + 1] : undefined;
  if (dirVal) opts.resultsDir = dirVal;
  if (actorVal) opts.actor = actorVal;
  applyClassificationResults(passId, opts)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[apply-results] Failed:", err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
