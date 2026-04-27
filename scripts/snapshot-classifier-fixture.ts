/**
 * Refresh the SAP 2602 classifier golden-file fixture from the live Bursa
 * Malaysia signed-off assessment. Filters to well-formed cases (verdict +
 * cited scope IDs valid against the live catalog) so the fixture is a clean
 * ground truth for Phase 3+ classifier-against-fixture tests.
 *
 * Each refresh is a deliberate act — not run on every test invocation. This
 * is the exact pattern of `pnpm catalog:snapshot` (Phase 0 sister script).
 *
 * Usage:
 *   $ pnpm fixtures:classifier:refresh
 *
 * Writes:
 *   tests/fixtures/classification/sap-2602/cases.json
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const SOURCE_ASSESSMENT_ID = "cmofk3zql000163ubn43nkhqy"; // Bursa Malaysia, signed-off
const CASES_PER_BUCKET = 8;
const KNOWN_EXTENSIBILITY_TAGS = new Set(["KUE", "ILM", "RAL"]);

interface Case {
  bursaRequirementId: string;
  module: string;
  code: string;
  requirementText: string;
  requirementClass: string | null;
  requirementType: string | null;
  expectedVerdict: string;
  expectedSapModule: string | null;
  expectedScopeItemIds: string | null;
  expectedScopeItemNames: string | null;
  bucket: "O" | "C" | "G" | "N/A";
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const catalog = new Set<string>();
  const items = await prisma.scopeItem.findMany({ select: { id: true } });
  items.forEach((i) => catalog.add(i.id));

  const fixture = {
    producedFromAssessmentId: SOURCE_ASSESSMENT_ID,
    sapVersion: "2602",
    refreshedAt: new Date().toISOString(),
    cases: [] as Case[],
  };

  const buckets: Array<"O" | "C" | "G" | "N/A"> = ["O", "C", "G", "N/A"];

  for (const bucket of buckets) {
    const candidates = await prisma.clientRequirement.findMany({
      where: {
        assessmentId: SOURCE_ASSESSMENT_ID,
        solutionProviderResponse: { startsWith: bucket === "N/A" ? "N/A" : bucket },
      },
      select: {
        id: true, module: true, code: true, requirementText: true,
        requirementClass: true, requirementType: true,
        solutionProviderResponse: true, sapModule: true,
        scopeItemIds: true, scopeItemNames: true,
      },
      orderBy: { sortOrder: "asc" },
      take: 30,
    });

    let kept = 0;
    for (const r of candidates) {
      if (kept >= CASES_PER_BUCKET) break;

      // O/C: cited IDs must all be in catalog (or known extensibility tags)
      if (bucket === "O" || bucket === "C") {
        const ids = (r.scopeItemIds ?? "")
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter((s) => s && s !== "—");
        if (ids.length === 0) continue;
        const unknown = ids.filter((id) => !catalog.has(id) && !KNOWN_EXTENSIBILITY_TAGS.has(id));
        if (unknown.length > 0) continue;
      }
      // G: must have a non-empty product name
      if (bucket === "G" && (!r.scopeItemNames || r.scopeItemNames === "—")) continue;
      // N/A: sapModule must be "—" (or null)
      if (bucket === "N/A" && r.sapModule && r.sapModule !== "—") continue;

      fixture.cases.push({
        bursaRequirementId: r.id,
        module: r.module,
        code: r.code,
        requirementText: r.requirementText.length > 800 ? r.requirementText.slice(0, 800) + "..." : r.requirementText,
        requirementClass: r.requirementClass,
        requirementType: r.requirementType,
        expectedVerdict: r.solutionProviderResponse ?? "",
        expectedSapModule: r.sapModule,
        expectedScopeItemIds: r.scopeItemIds,
        expectedScopeItemNames: r.scopeItemNames,
        bucket,
      });
      kept++;
    }
    console.log(`  bucket=${bucket}: kept ${kept} of ${candidates.length}`);
  }

  const dir = join(__dirname, "..", "tests", "fixtures", "classification", "sap-2602");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "cases.json");
  writeFileSync(path, JSON.stringify(fixture, null, 2));
  console.log(`Wrote ${fixture.cases.length} cases → ${path}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
