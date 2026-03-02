/**
 * Manifest Diff Script — Compares two dependency manifests across SAP versions.
 *
 * Usage:
 *   npx tsx scripts/diff-manifests.ts <old-version> <new-version>
 *   npx tsx scripts/diff-manifests.ts 2508 2602
 *
 * Output: scripts/manifests/diff-{old}-to-{new}.json
 */

import * as fs from "fs";
import * as path from "path";

import type {
  DependencyManifest,
  WithinScopeRule,
  CrossScopeRule,
  ManifestDiffEntry,
  ManifestDiffReport,
} from "../src/lib/dependency/manifest-types";

// ---------------------------------------------------------------------------
// Stable key generation
// ---------------------------------------------------------------------------

function withinScopeKey(rule: WithinScopeRule): string {
  const sourceKey = rule.source.guid ?? rule.source.title;
  const targetKey = rule.target.guid ?? rule.target.title;
  return `within:${rule.scopeItemCode}:${sourceKey}→${targetKey}`;
}

function crossScopeKey(rule: CrossScopeRule): string {
  const pair = [rule.sourceScopeCode, rule.targetScopeCode].sort().join(":");
  const sourceKey = rule.source.guid ?? rule.source.title;
  const targetKey = rule.target.guid ?? rule.target.title;
  return `cross:${pair}:${sourceKey}→${targetKey}`;
}

// ---------------------------------------------------------------------------
// Diff logic
// ---------------------------------------------------------------------------

function diffRules<T extends WithinScopeRule | CrossScopeRule>(
  oldRules: T[],
  newRules: T[],
  keyFn: (rule: T) => string,
): { added: ManifestDiffEntry[]; removed: ManifestDiffEntry[]; changed: ManifestDiffEntry[]; unchangedCount: number } {
  const oldMap = new Map<string, T>();
  for (const rule of oldRules) {
    oldMap.set(keyFn(rule), rule);
  }

  const newMap = new Map<string, T>();
  for (const rule of newRules) {
    newMap.set(keyFn(rule), rule);
  }

  const added: ManifestDiffEntry[] = [];
  const removed: ManifestDiffEntry[] = [];
  const changed: ManifestDiffEntry[] = [];
  let unchangedCount = 0;

  // Find added and changed
  for (const [key, newRule] of newMap) {
    const oldRule = oldMap.get(key);
    if (!oldRule) {
      added.push({ type: "added", key, newRule });
    } else {
      // Compare key fields
      const changes: string[] = [];
      if (newRule.businessReason !== oldRule.businessReason) changes.push("businessReason");
      if (newRule.confidence !== oldRule.confidence) changes.push("confidence");

      // Type-specific comparisons
      if ("dependencyType" in newRule && "dependencyType" in oldRule) {
        if (newRule.dependencyType !== oldRule.dependencyType) changes.push("dependencyType");
        if ((newRule as WithinScopeRule).propagationRule !== (oldRule as WithinScopeRule).propagationRule) {
          changes.push("propagationRule");
        }
      }
      if ("direction" in newRule && "direction" in oldRule) {
        if (newRule.direction !== oldRule.direction) changes.push("direction");
      }

      if (changes.length > 0) {
        changed.push({ type: "changed", key, oldRule, newRule, changes });
      } else {
        unchangedCount++;
      }
    }
  }

  // Find removed
  for (const [key, oldRule] of oldMap) {
    if (!newMap.has(key)) {
      removed.push({ type: "removed", key, oldRule });
    }
  }

  return { added, removed, changed, unchangedCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const oldVersion = process.argv[2];
  const newVersion = process.argv[3];

  if (!oldVersion || !newVersion) {
    console.error("Usage: npx tsx scripts/diff-manifests.ts <old-version> <new-version>");
    console.error("Example: npx tsx scripts/diff-manifests.ts 2508 2602");
    process.exit(1);
  }

  const oldPath = path.resolve(__dirname, `manifests/dependency-manifest-${oldVersion}.json`);
  const newPath = path.resolve(__dirname, `manifests/dependency-manifest-${newVersion}.json`);

  if (!fs.existsSync(oldPath)) {
    console.error(`Old manifest not found: ${oldPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(newPath)) {
    console.error(`New manifest not found: ${newPath}`);
    process.exit(1);
  }

  const oldManifest: DependencyManifest = JSON.parse(fs.readFileSync(oldPath, "utf-8"));
  const newManifest: DependencyManifest = JSON.parse(fs.readFileSync(newPath, "utf-8"));

  console.log(`=== Manifest Diff: ${oldVersion} → ${newVersion} ===\n`);

  // Diff within-scope
  const withinDiff = diffRules(
    oldManifest.withinScope,
    newManifest.withinScope,
    withinScopeKey,
  );

  // Diff cross-scope
  const crossDiff = diffRules(
    oldManifest.crossScope,
    newManifest.crossScope,
    crossScopeKey,
  );

  // Build report
  const report: ManifestDiffReport = {
    oldVersion,
    newVersion,
    generatedAt: new Date().toISOString(),
    added: [...withinDiff.added, ...crossDiff.added],
    removed: [...withinDiff.removed, ...crossDiff.removed],
    changed: [...withinDiff.changed, ...crossDiff.changed],
    unchangedCount: withinDiff.unchangedCount + crossDiff.unchangedCount,
  };

  // Print summary
  console.log("Within-scope rules:");
  console.log(`  Old: ${oldManifest.withinScope.length}`);
  console.log(`  New: ${newManifest.withinScope.length}`);
  console.log(`  Added: ${withinDiff.added.length}`);
  console.log(`  Removed: ${withinDiff.removed.length}`);
  console.log(`  Changed: ${withinDiff.changed.length}`);
  console.log(`  Unchanged: ${withinDiff.unchangedCount}`);

  console.log("\nCross-scope rules:");
  console.log(`  Old: ${oldManifest.crossScope.length}`);
  console.log(`  New: ${newManifest.crossScope.length}`);
  console.log(`  Added: ${crossDiff.added.length}`);
  console.log(`  Removed: ${crossDiff.removed.length}`);
  console.log(`  Changed: ${crossDiff.changed.length}`);
  console.log(`  Unchanged: ${crossDiff.unchangedCount}`);

  console.log("\nTotal:");
  console.log(`  Added: ${report.added.length}`);
  console.log(`  Removed: ${report.removed.length}`);
  console.log(`  Changed: ${report.changed.length}`);
  console.log(`  Unchanged: ${report.unchangedCount}`);

  // Show first 5 of each category
  if (report.added.length > 0) {
    console.log("\nSample additions:");
    for (const entry of report.added.slice(0, 5)) {
      console.log(`  + ${entry.key}`);
    }
  }

  if (report.removed.length > 0) {
    console.log("\nSample removals:");
    for (const entry of report.removed.slice(0, 5)) {
      console.log(`  - ${entry.key}`);
    }
  }

  if (report.changed.length > 0) {
    console.log("\nSample changes:");
    for (const entry of report.changed.slice(0, 5)) {
      console.log(`  ~ ${entry.key} [${entry.changes?.join(", ")}]`);
    }
  }

  // Write report
  const outputPath = path.resolve(__dirname, `manifests/diff-${oldVersion}-to-${newVersion}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${outputPath}`);
}

main();
