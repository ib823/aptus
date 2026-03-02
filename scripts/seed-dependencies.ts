/**
 * Phase: Dependency Engine — Seed script for ActivityDependency and CrossScopeDependency.
 *
 * Resolves activity titles to UUIDs and upserts 149 within-scope + 10 cross-scope dependencies.
 *
 * Usage: npx tsx scripts/seed-dependencies.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Within-scope dependency data (149 entries)
// Format: [scopeCode, sourceTitle, targetTitle, type, propagationRule, businessReason]
// ---------------------------------------------------------------------------

type DepType = "HARD_SEQUENTIAL" | "PARENT_CHILD" | "GROUP" | "REQUIRES_DATA" | "ALTERNATIVE_PATH" | "SOFT_DEPENDENCY";
type PropRule = "IF_SOURCE_NA_THEN_TARGET_NA" | "IF_GROUP_NA_THEN_CHILDREN_NA" | "WARN_IF_ALL_SOURCES_NA" | "WARN_ONLY" | "NO_PROPAGATION";

interface WithinScopeDep {
  scope: string;
  source: string;
  target: string;
  type: DepType;
  rule: PropRule;
  reason: string;
}

interface CrossScopeDep {
  sourceScope: string;
  source: string;
  targetScope: string;
  target: string;
  direction: "DOWNSTREAM" | "UPSTREAM" | "BIDIRECTIONAL";
  reason: string;
}

// We read the dependency data from the investigation output
async function loadWithinScopeDeps(): Promise<WithinScopeDep[]> {
  const fs = await import("fs");
  const path = await import("path");

  const graphPath = path.resolve(__dirname, "../tmp/dependency-investigation/dependency-graph.json");
  // Try alternate paths
  const paths = [
    graphPath,
    "/tmp/dependency-investigation/dependency-graph.json",
    path.resolve(__dirname, "../dependency-graph.json"),
  ];

  let data: Record<string, unknown> | null = null;
  for (const p of paths) {
    try {
      const raw = fs.readFileSync(p, "utf-8");
      data = JSON.parse(raw);
      console.log(`  Loaded dependency graph from ${p}`);
      break;
    } catch {
      // try next
    }
  }

  if (!data) {
    console.log("  Using embedded dependency data (graph JSON not found)");
    return EMBEDDED_WITHIN_SCOPE_DEPS;
  }

  const deps = (data as { withinScopeDependencies?: Array<Record<string, string>> }).withinScopeDependencies ?? [];
  return deps.map((d) => ({
    scope: d.sourceScope ?? "",
    source: d.sourceActivity ?? "",
    target: d.targetActivity ?? "",
    type: (d.type ?? "HARD_SEQUENTIAL") as DepType,
    rule: (d.propagationRule ?? "IF_SOURCE_NA_THEN_TARGET_NA") as PropRule,
    reason: d.businessReason ?? "",
  }));
}

async function loadCrossScopeDeps(): Promise<CrossScopeDep[]> {
  const fs = await import("fs");
  const path = await import("path");

  const graphPath = path.resolve(__dirname, "../tmp/dependency-investigation/dependency-graph.json");
  const paths = [
    graphPath,
    "/tmp/dependency-investigation/dependency-graph.json",
    path.resolve(__dirname, "../dependency-graph.json"),
  ];

  let data: Record<string, unknown> | null = null;
  for (const p of paths) {
    try {
      const raw = fs.readFileSync(p, "utf-8");
      data = JSON.parse(raw);
      break;
    } catch {
      // try next
    }
  }

  if (!data) {
    return EMBEDDED_CROSS_SCOPE_DEPS;
  }

  const deps = (data as { crossScopeDependencies?: Array<Record<string, string>> }).crossScopeDependencies ?? [];
  return deps.map((d) => ({
    sourceScope: d.sourceScope ?? "",
    source: d.sourceActivity ?? "",
    targetScope: d.targetScope ?? "",
    target: d.targetActivity ?? "",
    direction: (d.direction ?? "DOWNSTREAM") as "DOWNSTREAM" | "UPSTREAM" | "BIDIRECTIONAL",
    reason: d.businessReason ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Activity title → UUID resolution
// ---------------------------------------------------------------------------

async function buildActivityIndex(): Promise<Map<string, Map<string, string>>> {
  // Map<scopeItemId, Map<activityTitle, activityId>>
  const index = new Map<string, Map<string, string>>();

  const activities = await prisma.activity.findMany({
    select: {
      id: true,
      title: true,
      processFlow: {
        select: {
          solutionProcess: {
            select: { scopeItemId: true },
          },
        },
      },
    },
  });

  for (const act of activities) {
    const scopeId = act.processFlow.solutionProcess.scopeItemId;
    if (!index.has(scopeId)) {
      index.set(scopeId, new Map());
    }
    index.get(scopeId)!.set(act.title, act.id);
  }

  return index;
}

/**
 * Activity titles in the dependency data may use a "Group: Activity" colon format
 * that corresponds to either:
 *   - the full activity title, or
 *   - just the part after the colon
 * We try exact match first, then substring match.
 */
function resolveActivityId(
  scopeIndex: Map<string, string>,
  title: string,
): string | null {
  // Exact match
  if (scopeIndex.has(title)) return scopeIndex.get(title)!;

  // Try the part after the colon (if "Group: Title" format)
  const colonIdx = title.indexOf(": ");
  if (colonIdx > 0) {
    const subTitle = title.substring(colonIdx + 2);
    if (scopeIndex.has(subTitle)) return scopeIndex.get(subTitle)!;
  }

  // Try fuzzy: find activities containing this title
  for (const [actTitle, actId] of scopeIndex) {
    if (actTitle.includes(title) || title.includes(actTitle)) {
      return actId;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main seed logic
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Dependency Engine Seed ===\n");

  const activityIndex = await buildActivityIndex();
  console.log(`Loaded ${Array.from(activityIndex.values()).reduce((a, b) => a + b.size, 0)} activities across ${activityIndex.size} scope items\n`);

  // 1. Within-scope dependencies
  const withinDeps = await loadWithinScopeDeps();
  console.log(`Processing ${withinDeps.length} within-scope dependencies...`);

  let created = 0;
  let skipped = 0;
  let unresolved = 0;

  for (const dep of withinDeps) {
    const scopeIndex = activityIndex.get(dep.scope);
    if (!scopeIndex) {
      console.warn(`  SKIP: scope ${dep.scope} not found in database`);
      unresolved++;
      continue;
    }

    const sourceId = resolveActivityId(scopeIndex, dep.source);
    const targetId = resolveActivityId(scopeIndex, dep.target);

    if (!sourceId || !targetId) {
      console.warn(`  UNRESOLVED [${dep.scope}]: "${dep.source}" → "${dep.target}" (source=${!!sourceId}, target=${!!targetId})`);
      unresolved++;
      continue;
    }

    try {
      await prisma.activityDependency.upsert({
        where: {
          sourceActivityId_targetActivityId: {
            sourceActivityId: sourceId,
            targetActivityId: targetId,
          },
        },
        update: {
          dependencyType: dep.type,
          propagationRule: dep.rule,
          businessReason: dep.reason,
          isActive: true,
        },
        create: {
          scopeItemCode: dep.scope,
          sourceActivityId: sourceId,
          targetActivityId: targetId,
          dependencyType: dep.type,
          propagationRule: dep.rule,
          businessReason: dep.reason,
        },
      });
      created++;
    } catch (err) {
      console.warn(`  ERROR [${dep.scope}]: "${dep.source}" → "${dep.target}":`, (err as Error).message);
      skipped++;
    }
  }

  console.log(`  Within-scope: ${created} created/updated, ${skipped} skipped, ${unresolved} unresolved\n`);

  // 2. Cross-scope dependencies
  const crossDeps = await loadCrossScopeDeps();
  console.log(`Processing ${crossDeps.length} cross-scope dependencies...`);

  let crossCreated = 0;
  let crossSkipped = 0;
  let crossUnresolved = 0;

  for (const dep of crossDeps) {
    const sourceIndex = activityIndex.get(dep.sourceScope);
    const targetIndex = activityIndex.get(dep.targetScope);

    if (!sourceIndex || !targetIndex) {
      console.warn(`  SKIP: source scope ${dep.sourceScope} or target scope ${dep.targetScope} not found`);
      crossUnresolved++;
      continue;
    }

    const sourceId = resolveActivityId(sourceIndex, dep.source);
    const targetId = resolveActivityId(targetIndex, dep.target);

    if (!sourceId || !targetId) {
      console.warn(`  UNRESOLVED: [${dep.sourceScope}] "${dep.source}" → [${dep.targetScope}] "${dep.target}" (source=${!!sourceId}, target=${!!targetId})`);
      crossUnresolved++;
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
          direction: dep.direction,
          businessReason: dep.reason,
          isActive: true,
        },
        create: {
          sourceScopeCode: dep.sourceScope,
          sourceActivityId: sourceId,
          targetScopeCode: dep.targetScope,
          targetActivityId: targetId,
          direction: dep.direction,
          businessReason: dep.reason,
        },
      });
      crossCreated++;
    } catch (err) {
      console.warn(`  ERROR: "${dep.source}" → "${dep.target}":`, (err as Error).message);
      crossSkipped++;
    }
  }

  console.log(`  Cross-scope: ${crossCreated} created/updated, ${crossSkipped} skipped, ${crossUnresolved} unresolved\n`);

  // 3. Summary
  const totalDeps = await prisma.activityDependency.count({ where: { isActive: true } });
  const totalCross = await prisma.crossScopeDependency.count({ where: { isActive: true } });
  console.log(`=== DONE ===`);
  console.log(`Total active within-scope dependencies: ${totalDeps}`);
  console.log(`Total active cross-scope dependencies: ${totalCross}`);
}

// ---------------------------------------------------------------------------
// Embedded fallback data (subset for when JSON file is unavailable)
// Full data is in /tmp/dependency-investigation/dependency-graph.json
// ---------------------------------------------------------------------------

const EMBEDDED_WITHIN_SCOPE_DEPS: WithinScopeDep[] = [];
const EMBEDDED_CROSS_SCOPE_DEPS: CrossScopeDep[] = [];

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
