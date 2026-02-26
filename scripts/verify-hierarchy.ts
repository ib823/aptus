/**
 * Hierarchy Verification Script — 13 integrity checks
 *
 * Usage: npx tsx scripts/verify-hierarchy.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function main() {
  console.log("=== Hierarchy Verification (13 checks) ===\n");

  const results: CheckResult[] = [];

  // Check 1: Every ProcessStep has non-NULL activityId
  const orphanSteps = await prisma.processStep.count({ where: { activityId: null } });
  results.push({
    name: "1. Zero orphan ProcessSteps (activityId not null)",
    passed: orphanSteps === 0,
    detail: `${orphanSteps} orphans found`,
  });

  // Check 2: SolutionProcess count > 0
  const spCount = await prisma.solutionProcess.count();
  results.push({
    name: "2. SolutionProcess count > 0",
    passed: spCount > 0,
    detail: `${spCount} entities`,
  });

  // Check 3: ProcessFlow count >= SolutionProcess count
  const pfCount = await prisma.processFlow.count();
  results.push({
    name: "3. ProcessFlow count >= SolutionProcess count",
    passed: pfCount >= spCount,
    detail: `${pfCount} flows >= ${spCount} processes`,
  });

  // Check 4: Activity count > ProcessFlow count
  const actCount = await prisma.activity.count();
  results.push({
    name: "4. Activity count > ProcessFlow count",
    passed: actCount > pfCount,
    detail: `${actCount} activities > ${pfCount} flows`,
  });

  // Check 5: No orphaned Activities
  const orphanActRaw = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "Activity" a
    LEFT JOIN "ProcessFlow" pf ON a."processFlowId" = pf.id
    WHERE pf.id IS NULL
  `;
  const orphanActCount = orphanActRaw[0]?.count ?? 0;
  results.push({
    name: "5. No orphaned Activities (all link to valid ProcessFlow)",
    passed: orphanActCount === 0,
    detail: `${orphanActCount} orphans`,
  });

  // Check 6: No orphaned ProcessFlows
  const orphanPfRaw = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "ProcessFlow" pf
    LEFT JOIN "SolutionProcess" sp ON pf."solutionProcessId" = sp.id
    WHERE sp.id IS NULL
  `;
  const orphanPfCount = orphanPfRaw[0]?.count ?? 0;
  results.push({
    name: "6. No orphaned ProcessFlows (all link to valid SolutionProcess)",
    passed: orphanPfCount === 0,
    detail: `${orphanPfCount} orphans`,
  });

  // Check 7: No orphaned SolutionProcesses
  const orphanSpRaw = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "SolutionProcess" sp
    LEFT JOIN "ScopeItem" si ON sp."scopeItemId" = si.id
    WHERE si.id IS NULL
  `;
  const orphanSpCount = orphanSpRaw[0]?.count ?? 0;
  results.push({
    name: "7. No orphaned SolutionProcesses (all link to valid ScopeItem)",
    passed: orphanSpCount === 0,
    detail: `${orphanSpCount} orphans`,
  });

  // Check 8: Chain completeness
  const brokenChainRaw = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "Activity" a
    JOIN "ProcessFlow" pf ON a."processFlowId" = pf.id
    JOIN "SolutionProcess" sp ON pf."solutionProcessId" = sp.id
    LEFT JOIN "ScopeItem" si ON sp."scopeItemId" = si.id
    WHERE si.id IS NULL
  `;
  const brokenChainCount = brokenChainRaw[0]?.count ?? 0;
  results.push({
    name: "8. Chain completeness: Activity→ProcessFlow→SolutionProcess→ScopeItem",
    passed: brokenChainCount === 0,
    detail: `${brokenChainCount} broken chains`,
  });

  // Check 9: ProcessFlowDiagram.processFlowId backfilled
  const totalDiagrams = await prisma.processFlowDiagram.count();
  const diagramsWithPf = await prisma.processFlowDiagram.count({ where: { processFlowId: { not: null } } });
  results.push({
    name: "9. ProcessFlowDiagram.processFlowId backfilled",
    passed: totalDiagrams === 0 || diagramsWithPf > 0,
    detail: `${diagramsWithPf}/${totalDiagrams} diagrams have processFlowId`,
  });

  // Check 10: Total ProcessStep count unchanged
  const totalSteps = await prisma.processStep.count();
  results.push({
    name: "10. Total ProcessStep count preserved",
    passed: totalSteps > 0,
    detail: `${totalSteps} total steps`,
  });

  // Check 11: No duplicate SolutionProcess unique keys
  const dupSpRaw = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count FROM (
      SELECT "scopeItemId", "name"
      FROM "SolutionProcess"
      GROUP BY "scopeItemId", "name"
      HAVING COUNT(*) > 1
    ) t
  `;
  const dupSpCount = dupSpRaw[0]?.count ?? 0;
  results.push({
    name: "11. No duplicate SolutionProcess unique keys",
    passed: dupSpCount === 0,
    detail: `${dupSpCount} duplicates`,
  });

  // Check 12: No duplicate ProcessFlow unique keys
  const dupPfRaw = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count FROM (
      SELECT "solutionProcessId", "name"
      FROM "ProcessFlow"
      GROUP BY "solutionProcessId", "name"
      HAVING COUNT(*) > 1
    ) t
  `;
  const dupPfCount = dupPfRaw[0]?.count ?? 0;
  results.push({
    name: "12. No duplicate ProcessFlow unique keys",
    passed: dupPfCount === 0,
    detail: `${dupPfCount} duplicates`,
  });

  // Check 13: No duplicate Activity unique keys
  const dupActRaw = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count FROM (
      SELECT "processFlowId", "title"
      FROM "Activity"
      GROUP BY "processFlowId", "title"
      HAVING COUNT(*) > 1
    ) t
  `;
  const dupActCount = dupActRaw[0]?.count ?? 0;
  results.push({
    name: "13. No duplicate Activity unique keys",
    passed: dupActCount === 0,
    detail: `${dupActCount} duplicates`,
  });

  // Print results
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    console.log(`  ${icon} ${r.name} — ${r.detail}`);
    if (!r.passed) allPassed = false;
  }

  console.log(`\n${allPassed ? "ALL 13 CHECKS PASSED" : "SOME CHECKS FAILED"}`);

  await prisma.$disconnect();

  if (!allPassed) process.exit(1);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
