/**
 * Dependency Derivation Pipeline — Extracts dependencies from SAP data using 4 signals.
 *
 * Signal 1: Process Flow Activity Ordering → Within-Scope (MEDIUM confidence)
 * Signal 2: Multi-Scope ConfigActivity → Cross-Scope (HIGH confidence)
 * Signal 3: Shared Application Area + Subarea → Cross-Scope (LOW confidence)
 * Signal 4: Prerequisites Text Parsing → Cross-Scope (MEDIUM confidence)
 *
 * Usage:
 *   npx tsx scripts/derive-dependencies.ts <version>
 *
 * Output: scripts/manifests/dependency-manifest-{version}.json
 */

import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import type {
  DependencyManifest,
  WithinScopeRule,
  CrossScopeRule,
  ActivityRef,
} from "../src/lib/dependency/manifest-types";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Signal 1: Process Flow Activity Ordering → Within-Scope
// ---------------------------------------------------------------------------

async function deriveFromProcessFlowOrdering(): Promise<WithinScopeRule[]> {
  console.log("\n--- Signal 1: Process Flow Activity Ordering ---");

  const activities = await prisma.activity.findMany({
    select: {
      id: true,
      guid: true,
      title: true,
      sequence: true,
      processFlow: {
        select: {
          id: true,
          name: true,
          solutionProcess: {
            select: {
              scopeItemId: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [
      { processFlowId: "asc" },
      { sequence: "asc" },
    ],
  });

  // Group by processFlow
  const byFlow = new Map<string, typeof activities>();
  for (const act of activities) {
    const flowId = act.processFlow.id;
    if (!byFlow.has(flowId)) byFlow.set(flowId, []);
    byFlow.get(flowId)!.push(act);
  }

  const rules: WithinScopeRule[] = [];

  for (const [, flowActivities] of byFlow) {
    // Sort by sequence within flow
    flowActivities.sort((a, b) => a.sequence - b.sequence);

    for (let i = 0; i < flowActivities.length - 1; i++) {
      const src = flowActivities[i]!;
      const tgt = flowActivities[i + 1]!;
      const scopeItemCode = src.processFlow.solutionProcess.scopeItemId;
      const flowName = src.processFlow.name;

      const sourceRef: ActivityRef = {
        guid: src.guid,
        title: src.title,
        processFlowName: flowName,
      };

      const targetRef: ActivityRef = {
        guid: tgt.guid,
        title: tgt.title,
        processFlowName: flowName,
      };

      rules.push({
        scopeItemCode,
        source: sourceRef,
        target: targetRef,
        dependencyType: "HARD_SEQUENTIAL",
        propagationRule: "IF_SOURCE_NA_THEN_TARGET_NA",
        businessReason: `Sequential ordering in process flow "${flowName}" (${src.sequence}→${tgt.sequence})`,
        confidence: "MEDIUM",
        derivedFrom: {
          signal: "PROCESS_FLOW_ORDERING",
          detail: `ProcessFlow: ${flowName}, seq ${src.sequence}→${tgt.sequence}`,
        },
      });
    }
  }

  console.log(`  Derived ${rules.length} within-scope rules from ${byFlow.size} process flows`);
  return rules;
}

// ---------------------------------------------------------------------------
// Signal 2: Multi-Scope ConfigActivity → Cross-Scope
// ---------------------------------------------------------------------------

async function deriveFromMultiScopeConfig(): Promise<CrossScopeRule[]> {
  console.log("\n--- Signal 2: Multi-Scope ConfigActivity ---");

  const configs = await prisma.configActivity.findMany({
    where: {
      rawScopeItemIds: { not: null },
    },
    select: {
      rawScopeItemIds: true,
      configItemName: true,
      applicationArea: true,
      applicationSubarea: true,
    },
  });

  const rules: CrossScopeRule[] = [];
  const seenPairs = new Set<string>();

  // Also check scopeItemId values that contain commas (for data that predates rawScopeItemIds)
  const multiIdConfigs = await prisma.configActivity.findMany({
    where: {
      scopeItemId: { contains: "," },
    },
    select: {
      scopeItemId: true,
      configItemName: true,
      applicationArea: true,
      applicationSubarea: true,
    },
  });

  const allMulti = [
    ...configs.map((c) => ({
      rawIds: c.rawScopeItemIds!,
      configName: c.configItemName,
      area: c.applicationArea,
      subarea: c.applicationSubarea,
    })),
    ...multiIdConfigs.map((c) => ({
      rawIds: c.scopeItemId,
      configName: c.configItemName,
      area: c.applicationArea,
      subarea: c.applicationSubarea,
    })),
  ];

  for (const config of allMulti) {
    const scopeIds = config.rawIds
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s && s !== "All");

    if (scopeIds.length < 2) continue;

    // Create pairs (avoid duplicates)
    for (let i = 0; i < scopeIds.length; i++) {
      for (let j = i + 1; j < scopeIds.length; j++) {
        const key = [scopeIds[i], scopeIds[j]].sort().join(":");
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);

        // No specific activity ref for config-level dependencies
        const ref: ActivityRef = {
          guid: null,
          title: `Shared config: ${config.configName}`,
          processFlowName: null,
        };

        rules.push({
          sourceScopeCode: scopeIds[i]!,
          targetScopeCode: scopeIds[j]!,
          source: ref,
          target: ref,
          direction: "BIDIRECTIONAL",
          businessReason: `Shared configuration "${config.configName}" in ${config.area}/${config.subarea}`,
          confidence: "HIGH",
          derivedFrom: {
            signal: "MULTI_SCOPE_CONFIG",
            detail: `ConfigActivity "${config.configName}" references [${scopeIds.join(", ")}]`,
          },
        });
      }
    }
  }

  console.log(`  Derived ${rules.length} cross-scope rules from ${allMulti.length} multi-scope configs`);
  return rules;
}

// ---------------------------------------------------------------------------
// Signal 3: Shared Application Area + Subarea → Cross-Scope
// ---------------------------------------------------------------------------

async function deriveFromSharedAppArea(): Promise<CrossScopeRule[]> {
  console.log("\n--- Signal 3: Shared Application Area + Subarea ---");

  const configs = await prisma.configActivity.findMany({
    where: {
      scopeItemId: { not: "All" },
    },
    select: {
      scopeItemId: true,
      applicationArea: true,
      applicationSubarea: true,
    },
  });

  // Group by (area, subarea) → distinct scope IDs
  const groups = new Map<string, Set<string>>();
  for (const c of configs) {
    // Skip multi-ID entries (handled by Signal 2)
    if (c.scopeItemId.includes(",") || c.scopeItemId.includes(";")) continue;

    const key = `${c.applicationArea}|${c.applicationSubarea}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(c.scopeItemId);
  }

  const rules: CrossScopeRule[] = [];
  const seenPairs = new Set<string>();

  for (const [groupKey, scopeIds] of groups) {
    if (scopeIds.size < 2) continue;
    const parts = groupKey.split("|");
    const area = parts[0] ?? "";
    const subarea = parts[1] ?? "";
    const ids = Array.from(scopeIds);

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pairKey = [ids[i], ids[j]].sort().join(":");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const ref: ActivityRef = {
          guid: null,
          title: `Shared area: ${area} / ${subarea}`,
          processFlowName: null,
        };

        rules.push({
          sourceScopeCode: ids[i]!,
          targetScopeCode: ids[j]!,
          source: ref,
          target: ref,
          direction: "BIDIRECTIONAL",
          businessReason: `Both scope items share application area "${area}" / subarea "${subarea}"`,
          confidence: "LOW",
          derivedFrom: {
            signal: "SHARED_APP_AREA",
            detail: `Area: ${area}, Subarea: ${subarea}, Scope items: [${ids.join(", ")}]`,
          },
        });
      }
    }
  }

  console.log(`  Derived ${rules.length} cross-scope rules from ${groups.size} area/subarea groups`);
  return rules;
}

// ---------------------------------------------------------------------------
// Signal 4: Prerequisites Text Parsing → Cross-Scope
// ---------------------------------------------------------------------------

async function deriveFromPrerequisitesText(): Promise<CrossScopeRule[]> {
  console.log("\n--- Signal 4: Prerequisites Text Parsing ---");

  const scopeItems = await prisma.scopeItem.findMany({
    select: {
      id: true,
      nameClean: true,
      prerequisitesHtml: true,
    },
  });

  // Build lookup maps for matching
  const codeSet = new Set(scopeItems.map((s) => s.id));
  const nameToCode = new Map<string, string>();
  for (const s of scopeItems) {
    nameToCode.set(s.nameClean.toLowerCase(), s.id);
  }

  const rules: CrossScopeRule[] = [];
  const seenPairs = new Set<string>();

  for (const si of scopeItems) {
    if (!si.prerequisitesHtml) continue;

    // Strip HTML tags for text analysis
    const text = si.prerequisitesHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    // Match scope item codes (e.g., J59, 1NT, BDW, 22Z)
    const codePattern = /\b([A-Z0-9]{1,4}[A-Z][0-9]{0,2}|[0-9]{1,3}[A-Z]{1,3})\b/g;
    let match;
    while ((match = codePattern.exec(text)) !== null) {
      const code = match[1]!;
      if (code === si.id) continue; // Skip self-reference
      if (!codeSet.has(code)) continue;

      const pairKey = [si.id, code].sort().join(":");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const ref: ActivityRef = {
        guid: null,
        title: `Prerequisites reference`,
        processFlowName: null,
      };

      rules.push({
        sourceScopeCode: code,   // Referenced scope is the prerequisite (source)
        targetScopeCode: si.id,  // Current scope depends on it (target)
        source: ref,
        target: ref,
        direction: "DOWNSTREAM",
        businessReason: `${si.id} (${si.nameClean}) references ${code} in its prerequisites`,
        confidence: "MEDIUM",
        derivedFrom: {
          signal: "PREREQUISITES_TEXT",
          detail: `ScopeItem ${si.id} prerequisitesHtml mentions "${code}"`,
        },
      });
    }

    // Match scope item names
    for (const [name, code] of nameToCode) {
      if (code === si.id) continue;
      if (text.toLowerCase().includes(name) && name.length > 5) {
        const pairKey = [si.id, code].sort().join(":");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const ref: ActivityRef = {
          guid: null,
          title: `Prerequisites reference`,
          processFlowName: null,
        };

        rules.push({
          sourceScopeCode: code,
          targetScopeCode: si.id,
          source: ref,
          target: ref,
          direction: "DOWNSTREAM",
          businessReason: `${si.id} (${si.nameClean}) references "${name}" (${code}) in its prerequisites`,
          confidence: "MEDIUM",
          derivedFrom: {
            signal: "PREREQUISITES_TEXT",
            detail: `ScopeItem ${si.id} prerequisitesHtml mentions scope "${name}" (${code})`,
          },
        });
      }
    }
  }

  console.log(`  Derived ${rules.length} cross-scope rules from prerequisites text`);
  return rules;
}

// ---------------------------------------------------------------------------
// Content hash
// ---------------------------------------------------------------------------

function computeContentHash(
  withinScope: WithinScopeRule[],
  crossScope: CrossScopeRule[],
): string {
  const body = JSON.stringify({ withinScope, crossScope }, Object.keys({}).sort());
  return crypto.createHash("sha256").update(body).digest("hex");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: npx tsx scripts/derive-dependencies.ts <version>");
    console.error("Example: npx tsx scripts/derive-dependencies.ts 2508");
    process.exit(1);
  }

  console.log(`=== Dependency Derivation Pipeline (version ${version}) ===`);

  // Run all 4 signals
  const withinScope = await deriveFromProcessFlowOrdering();

  const crossScopeSignal2 = await deriveFromMultiScopeConfig();
  const crossScopeSignal3 = await deriveFromSharedAppArea();
  const crossScopeSignal4 = await deriveFromPrerequisitesText();

  // Merge cross-scope rules, preferring higher confidence for duplicate pairs
  const crossScopeMap = new Map<string, CrossScopeRule>();
  const confidenceRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

  for (const rule of [...crossScopeSignal2, ...crossScopeSignal4, ...crossScopeSignal3]) {
    const key = [rule.sourceScopeCode, rule.targetScopeCode].sort().join(":");
    const existing = crossScopeMap.get(key);
    if (!existing || (confidenceRank[rule.confidence] ?? 0) > (confidenceRank[existing.confidence] ?? 0)) {
      crossScopeMap.set(key, rule);
    }
  }

  const crossScope = Array.from(crossScopeMap.values());

  // Count scope items
  const totalScopeItems = await prisma.scopeItem.count();

  // Build manifest
  const contentHash = computeContentHash(withinScope, crossScope);
  const manifest: DependencyManifest = {
    version,
    generatedAt: new Date().toISOString(),
    contentHash,
    withinScope,
    crossScope,
    metadata: {
      totalScopeItems,
      derivationSignals: [
        "PROCESS_FLOW_ORDERING",
        "MULTI_SCOPE_CONFIG",
        "SHARED_APP_AREA",
        "PREREQUISITES_TEXT",
      ],
    },
  };

  // Write manifest
  const outputPath = path.resolve(__dirname, `manifests/dependency-manifest-${version}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

  // Summary
  console.log("\n=== Derivation Summary ===");
  console.log(`  Version:          ${version}`);
  console.log(`  Within-scope:     ${withinScope.length} rules`);
  console.log(`  Cross-scope:      ${crossScope.length} rules (deduplicated)`);
  console.log(`    Signal 2 (config): ${crossScopeSignal2.length}`);
  console.log(`    Signal 3 (area):   ${crossScopeSignal3.length}`);
  console.log(`    Signal 4 (prereq): ${crossScopeSignal4.length}`);
  console.log(`  Content hash:     ${contentHash.substring(0, 16)}...`);
  console.log(`  Output:           ${outputPath}`);
  console.log(`  Total scope items: ${totalScopeItems}`);
}

main()
  .catch((err) => {
    console.error("Derivation failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
