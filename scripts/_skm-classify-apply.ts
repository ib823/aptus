/**
 * SKM classification — apply: read a result file (my classifications) and
 * persist via the verdict-writer chokepoint with FK-validated scope citations.
 *
 * Result file format (JSON):
 * {
 *   "passId": "...",       // from the emit file
 *   "protocolVersionId": "...",
 *   "results": [
 *     {
 *       "requirementId": "...",
 *       "verdict": "O - Out Of The Box" | "C - Configuration" | "G - Gap" | "N/A - Out of Scope",
 *       "confidence": "high" | "medium" | "low",
 *       "sapModule": "FI-AP" | "MM" | "—" | etc.,
 *       "remarksMd": "...",
 *       "scopeCitations": [
 *         { "scopeCode": "J60", "role": "primary", "rationaleMd": "..." }
 *       ]
 *     }
 *   ]
 * }
 *
 * The apply step resolves scopeCode → ScopeItem.id WITHIN the assessment's
 * catalog (Private 2025-FPS1) so cross-edition citation is impossible.
 */
import { PrismaClient } from "@prisma/client";
import { writeVerdict, VerdictWriteError } from "../src/lib/classification/verdict-writer";
import fs from "node:fs";

const prisma = new PrismaClient();

interface ResultRow {
  requirementId: string;
  verdict: string;
  confidence?: "high" | "medium" | "low" | null;
  sapModule?: string | null;
  remarksMd: string;
  scopeCitations: Array<{
    scopeCode: string;
    role: "primary" | "secondary" | "gap-target" | "alternative";
    rationaleMd?: string;
  }>;
}

interface ResultFile {
  passId: string;
  protocolVersionId: string;
  results: ResultRow[];
}

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main(): Promise<void> {
  const inPath = arg("in");
  if (!inPath) throw new Error("--in is required");
  const raw = fs.readFileSync(inPath, "utf8");
  const data = JSON.parse(raw) as ResultFile;

  if (!data.passId || !data.protocolVersionId) {
    throw new Error("Result file missing passId / protocolVersionId");
  }
  if (!Array.isArray(data.results) || data.results.length === 0) {
    throw new Error("Result file has no results[]");
  }

  // Resolve passId → assessment + catalog
  const pass = await prisma.classificationPass.findUnique({
    where: { id: data.passId },
    select: { id: true, assessmentId: true, catalogVersionId: true },
  });
  if (!pass) throw new Error(`Pass ${data.passId} not found`);

  // Build scopeCode → ScopeItem.id map for the assessment's catalog
  const items = await prisma.scopeItem.findMany({
    where: { catalogVersionId: pass.catalogVersionId },
    select: { id: true, scopeCode: true },
  });
  const codeToId = new Map(items.map((i) => [i.scopeCode, i.id]));

  let written = 0;
  let errors = 0;
  const errorsByCode: Record<string, number> = {};

  for (const r of data.results) {
    // Resolve scope codes → ScopeItem.id (FK target)
    const citations = [];
    const unresolvedCodes: string[] = [];
    for (const c of r.scopeCitations) {
      const id = codeToId.get(c.scopeCode);
      if (!id) {
        unresolvedCodes.push(c.scopeCode);
        continue;
      }
      citations.push({
        scopeItemId: id,
        role: c.role,
        ...(c.rationaleMd ? { rationaleMd: c.rationaleMd } : {}),
      });
    }

    if (unresolvedCodes.length > 0) {
      console.warn(
        `  ⚠️  ${r.requirementId}: ${unresolvedCodes.length} unresolved code(s) [${unresolvedCodes.join(", ")}] — skipped from citations`,
      );
    }

    try {
      await writeVerdict({
        requirementId: r.requirementId,
        passId: data.passId,
        protocolVersionId: data.protocolVersionId,
        verdict: r.verdict,
        confidence: r.confidence ?? null,
        sapModule: r.sapModule ?? null,
        remarksMd: r.remarksMd,
        actor: "claude-code-cli",
        source: "AI",
        scopeCitations: citations,
      });
      written++;
    } catch (err) {
      errors++;
      const msg = err instanceof VerdictWriteError ? err.code : (err as Error).message;
      errorsByCode[msg] = (errorsByCode[msg] ?? 0) + 1;
      console.warn(`  ⚠️  ${r.requirementId}: ${msg}`);
    }
  }

  console.log(`apply: ${written} verdicts written, ${errors} errors`);
  if (errors > 0) {
    console.log("Error breakdown:");
    for (const [code, n] of Object.entries(errorsByCode)) console.log(`  ${code}: ${n}`);
  }

  // Distribution
  const dist = { O: 0, C: 0, G: 0, NA: 0 };
  for (const r of data.results) {
    const t = r.verdict.trim().toUpperCase();
    if (t.startsWith("O")) dist.O++;
    else if (t.startsWith("C")) dist.C++;
    else if (t.startsWith("G")) dist.G++;
    else if (t.startsWith("N")) dist.NA++;
  }
  console.log(`Distribution: O=${dist.O} C=${dist.C} G=${dist.G} N/A=${dist.NA}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
