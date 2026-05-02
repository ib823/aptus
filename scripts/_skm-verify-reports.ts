/**
 * Local verification of SKM reports after the Path-B fixes.
 * Invokes the data accessors + the readiness scorecard predicates the same
 * way the route handlers would, and prints the key shapes — without going
 * through HTTP + auth.
 */

import { prisma } from "../src/lib/db/prisma";
import {
  getReportSummary,
  getFindingsDataForReport,
  getSapBestPracticeClassificationData,
  getTraceabilityDataForReport,
} from "../src/lib/report/report-data";
import { calculateReadinessScorecard } from "../src/lib/report/readiness-calculator";

const ID = "cmol80gpu000163u2p9sachff";

async function readinessInputs() {
  const [
    totalScopeItems,
    decidedScopeItems,
    totalSteps,
    reviewedSteps,
    totalGaps,
    resolvedGaps,
    totalIntegrations,
    analyzedIntegrations,
    totalDmObjects,
    readyDmObjects,
    totalOcmImpacts,
    mitigatedOcmImpacts,
    totalStakeholders,
    activeStakeholders,
    totalSignOffs,
    completedSignOffs,
  ] = await Promise.all([
    prisma.scopeSelection.count({ where: { assessmentId: ID } }),
    prisma.scopeSelection.count({ where: { assessmentId: ID, relevance: { not: "MAYBE" } } }),
    prisma.stepResponse.count({ where: { assessmentId: ID } }),
    prisma.stepResponse.count({ where: { assessmentId: ID, fitStatus: { not: "PENDING" } } }),
    prisma.gapResolution.count({ where: { assessmentId: ID } }),
    prisma.gapResolution.count({
      where: { assessmentId: ID, OR: [{ clientApproved: true }, { decidedBy: { not: null } }] },
    }),
    prisma.integrationPoint.count({ where: { assessmentId: ID } }),
    prisma.integrationPoint.count({ where: { assessmentId: ID, status: { notIn: ["identified", "draft"] } } }),
    prisma.dataMigrationObject.count({ where: { assessmentId: ID } }),
    prisma.dataMigrationObject.count({ where: { assessmentId: ID, status: { notIn: ["identified", "draft"] } } }),
    prisma.ocmImpact.count({ where: { assessmentId: ID } }),
    prisma.ocmImpact.count({ where: { assessmentId: ID, status: { notIn: ["identified", "draft"] } } }),
    prisma.assessmentStakeholder.count({ where: { assessmentId: ID } }),
    prisma.assessmentStakeholder.count({ where: { assessmentId: ID, acceptedAt: { not: null } } }),
    prisma.assessmentSignOff.count({ where: { assessmentId: ID } }),
    prisma.assessmentSignOff.count({ where: { assessmentId: ID, acknowledgement: true } }),
  ]);
  return {
    totalScopeItems, decidedScopeItems,
    totalSteps, reviewedSteps,
    totalGaps, resolvedGaps,
    totalIntegrations, analyzedIntegrations,
    totalDmObjects, readyDmObjects,
    totalOcmImpacts, mitigatedOcmImpacts,
    totalStakeholders, activeStakeholders,
    totalSignOffs, completedSignOffs,
  };
}

async function main() {
  console.log("\n══════ READINESS SCORECARD ══════");
  const inputs = await readinessInputs();
  console.log("Predicate inputs:", inputs);
  const sc = calculateReadinessScorecard(inputs);
  console.log(`Overall: ${sc.overallScore}/100  status=${sc.overallStatus}  → ${sc.goNoGo.toUpperCase()}`);
  console.log(`Summary: ${sc.executiveSummary}`);
  console.log("Categories:");
  for (const c of sc.categories) {
    const tag = c.notApplicable ? "N/A" : `${c.score}/100 ${c.status.toUpperCase()}`;
    console.log(`  ${c.category.padEnd(28)} ${tag.padEnd(16)} ${c.findings[0] ?? ""}`);
  }

  console.log("\n══════ EXECUTIVE SUMMARY (verdict block) ══════");
  const summary = await getReportSummary(ID);
  console.log(`Total steps (effective): ${summary.steps.total}`);
  console.log(`Reviewed: ${summary.steps.reviewed}  Pending: ${summary.steps.pending}`);
  console.log(`FIT: ${summary.steps.fit}  CONFIGURE: ${summary.steps.configure}  GAP: ${summary.steps.gap}  NA: ${summary.steps.na}`);
  console.log(`fitPercent: ${summary.steps.fitPercent}%`);
  console.log(`Gaps: total=${summary.gaps.total} resolved=${summary.gaps.resolved} effort=${summary.gaps.totalEffortDays}d`);

  console.log("\n══════ FINDINGS PDF (per-row outcome) ══════");
  const findings = await getFindingsDataForReport(ID);
  console.log(`Total reqs: ${findings.totals.total}`);
  console.log("Totals by outcome:", findings.totals.byOutcome);
  console.log(`Areas: ${findings.byArea.length}`);
  // Show first 3 areas with their distributions and the resolutionType pills on cards
  for (const a of findings.byArea.slice(0, 3)) {
    console.log(`  Area "${a.area}" (${a.total}):`, a.byOutcome);
    for (const c of a.cards) console.log(`    [${c.resolutionType.padEnd(13)}] ${c.reqId}`);
  }

  console.log("\n══════ SAP BEST PRACTICE CLASSIFICATION ══════");
  const cls = await getSapBestPracticeClassificationData(ID);
  console.log(`Catalog: ${cls.assessment.catalogEdition} ${cls.assessment.catalogVersion}`);
  console.log("Totals:", cls.totals);
  console.log(`Per-module rows: ${cls.perModule.length}`);

  console.log("\n══════ TRACEABILITY MATRIX (per-row outcome distribution) ══════");
  const trace = await getTraceabilityDataForReport(ID);
  const traceDist: Record<string, number> = {};
  for (const r of trace) traceDist[r.outcome] = (traceDist[r.outcome] ?? 0) + 1;
  console.log(`Rows: ${trace.length}`);
  console.log("Outcome distribution:", traceDist);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
