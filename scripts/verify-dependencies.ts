/**
 * Dependency Verification Script — 10 integrity checks.
 *
 * Extends the pattern from verify-hierarchy.ts to cover dependency data.
 *
 * Usage: npx tsx scripts/verify-dependencies.ts
 */

import { PrismaClient } from "@prisma/client";
import { kahnTopologicalSort } from "../src/lib/dependency/graph-algorithms";
import type { DirectedEdge } from "../src/lib/dependency/graph-algorithms";

const prisma = new PrismaClient();

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
  severity: "error" | "warning";
}

async function main() {
  console.log("=== Dependency Verification (10 checks) ===\n");

  const results: CheckResult[] = [];

  // Check 1: Zero orphan ActivityDependency (both activities exist)
  const orphanDepSourceRaw = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM "ActivityDependency" ad
     LEFT JOIN "Activity" a ON ad."sourceActivityId" = a.id
     WHERE a.id IS NULL AND ad."isActive" = true`,
  );
  const orphanDepTargetRaw = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM "ActivityDependency" ad
     LEFT JOIN "Activity" a ON ad."targetActivityId" = a.id
     WHERE a.id IS NULL AND ad."isActive" = true`,
  );
  const orphanSource = orphanDepSourceRaw[0]?.count ?? 0;
  const orphanTarget = orphanDepTargetRaw[0]?.count ?? 0;
  results.push({
    name: "1. Zero orphan ActivityDependency (both activities exist)",
    passed: orphanSource === 0 && orphanTarget === 0,
    detail: `${orphanSource} orphan sources, ${orphanTarget} orphan targets`,
    severity: "error",
  });

  // Check 2: Zero orphan CrossScopeDependency (both scope items exist)
  const crossDeps = await prisma.crossScopeDependency.findMany({
    where: { isActive: true },
    select: { sourceScopeCode: true, targetScopeCode: true },
  });
  const scopeIds = new Set(
    (await prisma.scopeItem.findMany({ select: { id: true } })).map((s) => s.id),
  );
  const orphanCross = crossDeps.filter(
    (d) => !scopeIds.has(d.sourceScopeCode) || !scopeIds.has(d.targetScopeCode),
  );
  results.push({
    name: "2. Zero orphan CrossScopeDependency (both scope items exist)",
    passed: orphanCross.length === 0,
    detail: `${orphanCross.length} orphan cross-scope deps`,
    severity: "error",
  });

  // Check 3: No cycles (Kahn's sort covers all nodes)
  const activeDeps = await prisma.activityDependency.findMany({
    where: { isActive: true },
    select: { sourceActivityId: true, targetActivityId: true },
  });
  const nodes = new Set<string>();
  const edges: DirectedEdge[] = [];
  for (const d of activeDeps) {
    nodes.add(d.sourceActivityId);
    nodes.add(d.targetActivityId);
    edges.push({ source: d.sourceActivityId, target: d.targetActivityId });
  }
  const kahnResult = kahnTopologicalSort(Array.from(nodes), edges);
  results.push({
    name: "3. No cycles in dependency graph (Kahn's topological sort)",
    passed: kahnResult.isDAG,
    detail: kahnResult.isDAG
      ? `${kahnResult.sorted.length} nodes sorted`
      : `${kahnResult.cycleNodes.length} nodes involved in cycles`,
    severity: "error",
  });

  // Check 4: No self-referential edges
  const selfRefCount = activeDeps.filter(
    (d) => d.sourceActivityId === d.targetActivityId,
  ).length;
  results.push({
    name: "4. No self-referential edges",
    passed: selfRefCount === 0,
    detail: `${selfRefCount} self-referential edges`,
    severity: "error",
  });

  // Check 5: No duplicate edges
  const edgeKeys = new Set<string>();
  let dupes = 0;
  for (const d of activeDeps) {
    const key = `${d.sourceActivityId}:${d.targetActivityId}`;
    if (edgeKeys.has(key)) dupes++;
    else edgeKeys.add(key);
  }
  results.push({
    name: "5. No duplicate edges",
    passed: dupes === 0,
    detail: `${dupes} duplicate edges`,
    severity: "error",
  });

  // Check 6: Every dependency has valid scopeItemCode
  const scopeCodesInDeps = new Set(
    (await prisma.activityDependency.findMany({
      where: { isActive: true },
      select: { scopeItemCode: true },
      distinct: ["scopeItemCode"],
    })).map((d) => d.scopeItemCode),
  );
  const invalidScopes = Array.from(scopeCodesInDeps).filter((s) => !scopeIds.has(s));
  results.push({
    name: "6. Every dependency has valid scopeItemCode",
    passed: invalidScopes.length === 0,
    detail: invalidScopes.length === 0
      ? `${scopeCodesInDeps.size} scope codes all valid`
      : `Invalid: [${invalidScopes.join(", ")}]`,
    severity: "error",
  });

  // Check 7: Cross-scope deps reference 2 different scope items
  const sameScopeCross = crossDeps.filter(
    (d) => d.sourceScopeCode === d.targetScopeCode,
  );
  results.push({
    name: "7. Cross-scope deps reference 2 different scope items",
    passed: sameScopeCross.length === 0,
    detail: `${sameScopeCross.length} same-scope cross-deps`,
    severity: "error",
  });

  // Check 8: All HIGH-confidence rules resolved (check manifest record)
  const manifestRecord = await prisma.dependencyManifestRecord.findFirst({
    orderBy: { appliedAt: "desc" },
  });
  if (manifestRecord) {
    const unresolvedPct = manifestRecord.unresolvedCount /
      (manifestRecord.resolvedCount + manifestRecord.unresolvedCount);
    results.push({
      name: "8. All HIGH-confidence rules resolved (<5% unresolved)",
      passed: unresolvedPct < 0.05,
      detail: `${manifestRecord.unresolvedCount} unresolved / ${manifestRecord.resolvedCount + manifestRecord.unresolvedCount} total (${(unresolvedPct * 100).toFixed(1)}%)`,
      severity: "warning",
    });
  } else {
    results.push({
      name: "8. All HIGH-confidence rules resolved",
      passed: true,
      detail: "No manifest record found (skipped)",
      severity: "warning",
    });
  }

  // Check 9: Graph connectivity report (warning-only)
  // Count how many distinct scope items have at least one dependency
  const scopesWithDeps = scopeCodesInDeps.size;
  const totalScopes = scopeIds.size;
  const coveragePct = totalScopes > 0 ? scopesWithDeps / totalScopes : 0;
  results.push({
    name: "9. Graph connectivity (scope coverage)",
    passed: true, // warning-only
    detail: `${scopesWithDeps}/${totalScopes} scope items have within-scope deps (${(coveragePct * 100).toFixed(1)}%)`,
    severity: "warning",
  });

  // Check 10: Propagation rule distribution is reasonable
  const propRules = await prisma.activityDependency.groupBy({
    by: ["propagationRule"],
    where: { isActive: true },
    _count: true,
  });
  const propDistribution = propRules.map(
    (r) => `${r.propagationRule}: ${r._count}`,
  ).join(", ");
  const hasHardProp = propRules.some(
    (r) => r.propagationRule === "IF_SOURCE_NA_THEN_TARGET_NA" && r._count > 0,
  );
  results.push({
    name: "10. Propagation rule distribution is reasonable",
    passed: propRules.length === 0 || hasHardProp,
    detail: propDistribution || "No active dependencies",
    severity: "warning",
  });

  // Print results
  let hasErrors = false;
  for (const r of results) {
    const icon = r.passed ? "\u2713" : r.severity === "error" ? "\u2717" : "\u26A0";
    console.log(`  ${icon} ${r.name} \u2014 ${r.detail}`);
    if (!r.passed && r.severity === "error") hasErrors = true;
  }

  const passCount = results.filter((r) => r.passed).length;
  console.log(`\n${passCount}/${results.length} checks passed${hasErrors ? " (ERRORS DETECTED)" : ""}`);

  await prisma.$disconnect();

  if (hasErrors) process.exit(1);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
