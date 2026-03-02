/**
 * Dependency Registration Script — Validates and persists a dependency manifest.
 *
 * Usage:
 *   npx tsx scripts/register-dependencies.ts <version>           # Apply
 *   npx tsx scripts/register-dependencies.ts <version> --dry-run  # Preview only
 *
 * Steps:
 * 1. Load manifest from scripts/manifests/dependency-manifest-{version}.json
 * 2. Build activity index
 * 3. Resolve all ActivityRefs to database UUIDs
 * 4. Validate: Kahn's topological sort for cycle detection, Tarjan's SCC for reporting
 * 5. Persist: Soft-deactivate existing, upsert new
 * 6. Record DependencyManifestRecord
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

import type { DependencyManifest } from "../src/lib/dependency/manifest-types";
import { buildActivityIndex, resolveManifest } from "../src/lib/dependency/manifest-loader";
import { kahnTopologicalSort, tarjanSCC } from "../src/lib/dependency/graph-algorithms";
import type { DirectedEdge } from "../src/lib/dependency/graph-algorithms";

const prisma = new PrismaClient();

async function main() {
  const version = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!version) {
    console.error("Usage: npx tsx scripts/register-dependencies.ts <version> [--dry-run]");
    process.exit(1);
  }

  console.log(`=== Dependency Registration (version ${version}${dryRun ? ", DRY RUN" : ""}) ===\n`);

  // 1. Load manifest
  const manifestPath = path.resolve(__dirname, `manifests/dependency-manifest-${version}.json`);
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    console.error(`Run: npx tsx scripts/derive-dependencies.ts ${version}`);
    process.exit(1);
  }

  const manifest: DependencyManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`Loaded manifest: ${manifest.withinScope.length} within-scope, ${manifest.crossScope.length} cross-scope rules`);

  // 2. Build activity index
  console.log("\nBuilding activity index...");
  const index = await buildActivityIndex(prisma);
  const totalActivities = Array.from(index.byScope.values()).reduce((a, b) => a + b.length, 0);
  console.log(`  ${totalActivities} activities across ${index.byScope.size} scope items`);

  // 3. Resolve all ActivityRefs
  console.log("\nResolving activity references...");
  const resolution = resolveManifest(manifest, index);
  console.log(`  Resolved: ${resolution.resolvedCount}`);
  console.log(`  Unresolved: ${resolution.unresolvedCount}`);
  console.log(`  Warnings: ${resolution.warningCount}`);

  // Print first 10 warnings
  let warningsPrinted = 0;
  for (const r of resolution.withinScope) {
    if (r.warnings.length > 0 && warningsPrinted < 10) {
      console.log(`    WARN [${r.rule.scopeItemCode}]: ${r.warnings[0]}`);
      warningsPrinted++;
    }
  }
  for (const r of resolution.crossScope) {
    if (r.warnings.length > 0 && warningsPrinted < 10) {
      console.log(`    WARN [${r.rule.sourceScopeCode}→${r.rule.targetScopeCode}]: ${r.warnings[0]}`);
      warningsPrinted++;
    }
  }

  // 4. Validate — cycle detection
  console.log("\nValidating graph...");

  // Build edges from resolved within-scope rules
  const resolvedWithin = resolution.withinScope.filter((r) => r.sourceId && r.targetId);
  const nodes = new Set<string>();
  const edges: DirectedEdge[] = [];

  for (const r of resolvedWithin) {
    nodes.add(r.sourceId!);
    nodes.add(r.targetId!);
    edges.push({ source: r.sourceId!, target: r.targetId! });
  }

  const nodeArray = Array.from(nodes);

  // Kahn's for overall cycle detection
  const kahnResult = kahnTopologicalSort(nodeArray, edges);
  console.log(`  Kahn's sort: ${kahnResult.isDAG ? "DAG (no cycles)" : `CYCLES DETECTED — ${kahnResult.cycleNodes.length} nodes involved`}`);

  if (!kahnResult.isDAG) {
    // Tarjan's for exact cycle identification
    const sccResult = tarjanSCC(nodeArray, edges);
    console.log(`  Tarjan's SCC: ${sccResult.cycles.length} cycle(s) found`);
    for (const cycle of sccResult.cycles.slice(0, 5)) {
      console.log(`    Cycle: [${cycle.join(" → ")}]`);
    }
    if (!dryRun) {
      console.error("\nAborting: Cycles detected. Fix the manifest and re-run.");
      process.exit(1);
    }
  }

  // Check for self-referential edges
  const selfEdges = edges.filter((e) => e.source === e.target);
  if (selfEdges.length > 0) {
    console.log(`  Self-referential edges: ${selfEdges.length} (will be skipped)`);
  }

  // Check for duplicate edges
  const edgeKeys = new Set<string>();
  let duplicateEdges = 0;
  for (const e of edges) {
    const key = `${e.source}:${e.target}`;
    if (edgeKeys.has(key)) {
      duplicateEdges++;
    } else {
      edgeKeys.add(key);
    }
  }
  if (duplicateEdges > 0) {
    console.log(`  Duplicate edges: ${duplicateEdges} (will be deduplicated)`);
  }

  console.log(`  Validation complete: ${resolvedWithin.length} within-scope edges validated`);

  // 5. Persist
  if (dryRun) {
    console.log("\n=== DRY RUN — No changes persisted ===");
    console.log(`  Would upsert ${resolvedWithin.length} ActivityDependency records`);
    const resolvedCross = resolution.crossScope.filter(
      (r) => r.rule.source.guid === null || (r.sourceId && r.targetId),
    );
    console.log(`  Would upsert ${resolvedCross.length} CrossScopeDependency records`);
    console.log(`  Would soft-deactivate existing dependencies`);
    return;
  }

  console.log("\nPersisting dependencies...");

  // Soft-deactivate existing
  const deactivatedWithin = await prisma.activityDependency.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });
  console.log(`  Soft-deactivated ${deactivatedWithin.count} existing within-scope dependencies`);

  const deactivatedCross = await prisma.crossScopeDependency.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });
  console.log(`  Soft-deactivated ${deactivatedCross.count} existing cross-scope dependencies`);

  // Upsert within-scope
  let withinCreated = 0;
  let withinSkipped = 0;

  for (const r of resolvedWithin) {
    if (r.sourceId === r.targetId) {
      withinSkipped++;
      continue;
    }
    try {
      await prisma.activityDependency.upsert({
        where: {
          sourceActivityId_targetActivityId: {
            sourceActivityId: r.sourceId!,
            targetActivityId: r.targetId!,
          },
        },
        update: {
          dependencyType: r.rule.dependencyType,
          propagationRule: r.rule.propagationRule,
          businessReason: r.rule.businessReason,
          isActive: true,
        },
        create: {
          scopeItemCode: r.rule.scopeItemCode,
          sourceActivityId: r.sourceId!,
          targetActivityId: r.targetId!,
          dependencyType: r.rule.dependencyType,
          propagationRule: r.rule.propagationRule,
          businessReason: r.rule.businessReason,
          isActive: true,
        },
      });
      withinCreated++;
    } catch (err) {
      withinSkipped++;
      if (withinSkipped <= 5) {
        console.warn(`    SKIP [${r.rule.scopeItemCode}]: ${(err as Error).message}`);
      }
    }
  }
  console.log(`  Within-scope: ${withinCreated} upserted, ${withinSkipped} skipped`);

  // Upsert cross-scope (only those with resolved activity IDs or scope-level rules)
  let crossCreated = 0;
  let crossSkipped = 0;

  for (const r of resolution.crossScope) {
    // For scope-level rules without specific activities, use a placeholder approach:
    // Create the cross-scope dep with available info
    const sourceId = r.sourceId;
    const targetId = r.targetId;

    if (!sourceId || !targetId) {
      // Scope-level only rule — still valuable as CrossScopeDependency
      // Try to find any activity in source/target scopes for the FK
      const sourceActs = index.byScope.get(r.rule.sourceScopeCode);
      const targetActs = index.byScope.get(r.rule.targetScopeCode);

      if (!sourceActs?.length || !targetActs?.length) {
        crossSkipped++;
        continue;
      }

      // Use first activity from each scope as representative
      const repSourceId = sourceActs[0]!.id;
      const repTargetId = targetActs[0]!.id;

      if (repSourceId === repTargetId) {
        crossSkipped++;
        continue;
      }

      try {
        await prisma.crossScopeDependency.upsert({
          where: {
            sourceActivityId_targetActivityId: {
              sourceActivityId: repSourceId,
              targetActivityId: repTargetId,
            },
          },
          update: {
            direction: r.rule.direction,
            businessReason: r.rule.businessReason,
            isActive: true,
          },
          create: {
            sourceScopeCode: r.rule.sourceScopeCode,
            sourceActivityId: repSourceId,
            targetScopeCode: r.rule.targetScopeCode,
            targetActivityId: repTargetId,
            direction: r.rule.direction,
            businessReason: r.rule.businessReason,
            isActive: true,
          },
        });
        crossCreated++;
      } catch {
        crossSkipped++;
      }
      continue;
    }

    if (sourceId === targetId) {
      crossSkipped++;
      continue;
    }

    try {
      await prisma.crossScopeDependency.upsert({
        where: {
          sourceActivityId_targetActivityId: {
            sourceActivityId: sourceId,
            targetActivityId: targetId,
          },
        },
        update: {
          direction: r.rule.direction,
          businessReason: r.rule.businessReason,
          isActive: true,
        },
        create: {
          sourceScopeCode: r.rule.sourceScopeCode,
          sourceActivityId: sourceId,
          targetScopeCode: r.rule.targetScopeCode,
          targetActivityId: targetId,
          direction: r.rule.direction,
          businessReason: r.rule.businessReason,
          isActive: true,
        },
      });
      crossCreated++;
    } catch {
      crossSkipped++;
    }
  }
  console.log(`  Cross-scope: ${crossCreated} upserted, ${crossSkipped} skipped`);

  // 6. Record manifest application
  await prisma.dependencyManifestRecord.upsert({
    where: { version },
    update: {
      contentHash: manifest.contentHash,
      withinCount: withinCreated,
      crossCount: crossCreated,
      resolvedCount: resolution.resolvedCount,
      unresolvedCount: resolution.unresolvedCount,
      appliedAt: new Date(),
      appliedBy: "register-dependencies.ts",
    },
    create: {
      version,
      contentHash: manifest.contentHash,
      withinCount: withinCreated,
      crossCount: crossCreated,
      resolvedCount: resolution.resolvedCount,
      unresolvedCount: resolution.unresolvedCount,
      appliedBy: "register-dependencies.ts",
    },
  });

  // Final summary
  const totalWithin = await prisma.activityDependency.count({ where: { isActive: true } });
  const totalCross = await prisma.crossScopeDependency.count({ where: { isActive: true } });

  console.log("\n=== Registration Complete ===");
  console.log(`  Active within-scope dependencies: ${totalWithin}`);
  console.log(`  Active cross-scope dependencies: ${totalCross}`);
  console.log(`  Manifest record saved for version ${version}`);
}

main()
  .catch((err) => {
    console.error("Registration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
