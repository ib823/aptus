/**
 * SKM StepResponse backfill.
 *
 * For each of SKM's 1,564 ClientRequirements, derive a single StepResponse
 * mapped to a ProcessStep belonging to the requirement's first cited scope
 * item. fitStatus comes from the requirement's classification bucket
 * (solutionProviderResponse), so step-based reports (Executive Summary,
 * Effort Estimate, Step Detail) finally have data that mirrors the
 * verdicts already in ClassificationVerdict.
 *
 * Idempotent: deletes any prior StepResponse rows authored by AUTO_BACKFILL
 * before re-inserting.
 */

import { prisma } from "../src/lib/db/prisma";

const ASSESSMENT_ID = "cmol80gpu000163u2p9sachff";
const ACTOR = "AUTO_BACKFILL";

function bucketOf(classification: string | null | undefined): "O" | "C" | "G" | "NA" | "Pending" {
  const s = (classification ?? "").trim().toUpperCase();
  if (!s) return "Pending";
  if (s.startsWith("O")) return "O";
  if (s.startsWith("C")) return "C";
  if (s.startsWith("G")) return "G";
  if (s.startsWith("N/A") || s.startsWith("NA") || s.startsWith("N -")) return "NA";
  return "Pending";
}

function bucketToFitStatus(b: ReturnType<typeof bucketOf>): "FIT" | "CONFIGURE" | "GAP" | "NA" | "PENDING" {
  switch (b) {
    case "O": return "FIT";
    case "C": return "CONFIGURE";
    case "G": return "GAP";
    case "NA": return "NA";
    case "Pending": return "PENDING";
  }
}

async function main() {
  // Sanity: assessment exists + is the SKM one
  const a = await prisma.assessment.findUniqueOrThrow({
    where: { id: ASSESSMENT_ID },
    select: { id: true, companyName: true, status: true },
  });
  console.log(`Assessment: ${a.companyName} (status=${a.status})`);

  // Wipe any prior AUTO_BACKFILL StepResponse rows so this script is idempotent
  const wiped = await prisma.stepResponse.deleteMany({
    where: { assessmentId: ASSESSMENT_ID, respondent: ACTOR },
  });
  console.log(`Wiped ${wiped.count} prior AUTO_BACKFILL StepResponse rows`);

  // Confirm no StepResponse rows remain (we've never had non-AUTO_BACKFILL ones either)
  const remaining = await prisma.stepResponse.count({ where: { assessmentId: ASSESSMENT_ID } });
  if (remaining > 0) {
    console.error(`Refusing to proceed: ${remaining} non-AUTO_BACKFILL StepResponse rows exist for this assessment.`);
    process.exit(2);
  }

  // Pull all requirements with their classification + first scope item
  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId: ASSESSMENT_ID },
    select: {
      id: true,
      code: true,
      module: true,
      solutionProviderResponse: true,
      scopeItemIds: true,
      sortOrder: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });
  console.log(`Loaded ${reqs.length} requirements`);

  // Pre-fetch ProcessSteps per scope item, sorted by sequence
  const allScopeIds = new Set<string>();
  for (const r of reqs) {
    const first = r.scopeItemIds?.split(",")[0]?.trim();
    if (first) allScopeIds.add(first);
  }
  const allSteps = await prisma.processStep.findMany({
    where: { scopeItemId: { in: [...allScopeIds] } },
    select: { id: true, scopeItemId: true, sequence: true },
    orderBy: [{ scopeItemId: "asc" }, { sequence: "asc" }],
  });
  console.log(`Loaded ${allSteps.length} candidate ProcessSteps across ${allScopeIds.size} scope items`);

  // Group steps by scope item with a cursor we advance per use
  const stepsByScope = new Map<string, string[]>();
  for (const s of allSteps) {
    const list = stepsByScope.get(s.scopeItemId) ?? [];
    list.push(s.id);
    stepsByScope.set(s.scopeItemId, list);
  }
  // Cursor for each scope-item — index of the next ProcessStep to use
  const cursorByScope = new Map<string, number>();
  // Fallback pool — every step ID, used when a requirement's scope item has no
  // remaining steps. Walks once.
  const fallbackPool = allSteps.map((s) => s.id);
  let fallbackCursor = 0;
  // Track used step IDs to honour the unique(assessmentId, processStepId) constraint
  const usedStepIds = new Set<string>();

  let assigned = 0;
  let skippedNoStep = 0;
  let usedFallback = 0;
  const dist: Record<string, number> = { FIT: 0, CONFIGURE: 0, GAP: 0, NA: 0, PENDING: 0 };
  const toCreate: Array<{
    assessmentId: string;
    processStepId: string;
    fitStatus: string;
    clientNote: string;
    respondent: string;
    respondedAt: Date;
  }> = [];

  for (const r of reqs) {
    const fitStatus = bucketToFitStatus(bucketOf(r.solutionProviderResponse));
    const firstScope = r.scopeItemIds?.split(",")[0]?.trim();

    let stepId: string | undefined;
    if (firstScope) {
      const list = stepsByScope.get(firstScope);
      if (list && list.length > 0) {
        const cur = cursorByScope.get(firstScope) ?? 0;
        // Advance cursor until we find an unused step (typically just one tick)
        let idx = cur;
        while (idx < list.length && usedStepIds.has(list[idx]!)) idx++;
        if (idx < list.length) {
          stepId = list[idx]!;
          cursorByScope.set(firstScope, idx + 1);
        }
      }
    }

    // Fallback: walk the global pool to find any unused step
    if (!stepId) {
      while (fallbackCursor < fallbackPool.length) {
        const candidate = fallbackPool[fallbackCursor++]!;
        if (!usedStepIds.has(candidate)) {
          stepId = candidate;
          usedFallback++;
          break;
        }
      }
    }

    if (!stepId) {
      skippedNoStep++;
      continue;
    }

    usedStepIds.add(stepId);
    dist[fitStatus] = (dist[fitStatus] ?? 0) + 1;
    toCreate.push({
      assessmentId: ASSESSMENT_ID,
      processStepId: stepId,
      fitStatus,
      clientNote: `Auto-derived from ClassificationVerdict (req ${r.code})`,
      respondent: ACTOR,
      respondedAt: new Date(),
    });
    assigned++;
  }

  console.log(`Prepared ${toCreate.length} StepResponse rows (skipped ${skippedNoStep}, used fallback ${usedFallback} times)`);
  console.log(`Distribution: ${JSON.stringify(dist)}`);

  // Bulk insert in chunks of 500 to keep the per-statement payload reasonable
  const CHUNK = 500;
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const chunk = toCreate.slice(i, i + CHUNK);
    await prisma.stepResponse.createMany({ data: chunk });
    console.log(`Inserted ${Math.min(i + CHUNK, toCreate.length)} / ${toCreate.length}`);
  }

  // Verify
  const finalCount = await prisma.stepResponse.count({ where: { assessmentId: ASSESSMENT_ID } });
  const finalDist: Record<string, number> = {};
  for (const status of ["FIT", "CONFIGURE", "GAP", "NA", "PENDING"] as const) {
    finalDist[status] = await prisma.stepResponse.count({
      where: { assessmentId: ASSESSMENT_ID, fitStatus: status },
    });
  }
  console.log(`Final StepResponse count: ${finalCount}`);
  console.log(`Final distribution: ${JSON.stringify(finalDist)}`);
  console.log("OK");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
