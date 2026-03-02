/**
 * Manifest Loader — Resolves ActivityRef identifiers to database UUIDs.
 *
 * Resolution priority:
 * 1. GUID match (most stable across SAP versions)
 * 2. Exact title match within scope
 * 3. Title + processFlowName disambiguation
 * 4. Fuzzy substring (last resort, logged as warning)
 */

import type { PrismaClient } from "@prisma/client";
import type {
  ActivityRef,
  ResolutionResult,
  DependencyManifest,
  WithinScopeRule,
  CrossScopeRule,
} from "./manifest-types";

// ---------------------------------------------------------------------------
// Activity index types
// ---------------------------------------------------------------------------

interface ActivityRecord {
  id: string;
  guid: string | null;
  title: string;
  processFlowName: string;
  scopeItemId: string;
}

interface ActivityIndex {
  /** Map<scopeItemId, ActivityRecord[]> */
  byScope: Map<string, ActivityRecord[]>;
  /** Map<guid, ActivityRecord> */
  byGuid: Map<string, ActivityRecord>;
}

// ---------------------------------------------------------------------------
// Build index from database
// ---------------------------------------------------------------------------

export async function buildActivityIndex(
  prisma: PrismaClient,
): Promise<ActivityIndex> {
  const activities = await prisma.activity.findMany({
    select: {
      id: true,
      guid: true,
      title: true,
      processFlow: {
        select: {
          name: true,
          solutionProcess: {
            select: { scopeItemId: true },
          },
        },
      },
    },
  });

  const byScope = new Map<string, ActivityRecord[]>();
  const byGuid = new Map<string, ActivityRecord>();

  for (const act of activities) {
    const record: ActivityRecord = {
      id: act.id,
      guid: act.guid,
      title: act.title,
      processFlowName: act.processFlow.name,
      scopeItemId: act.processFlow.solutionProcess.scopeItemId,
    };

    const scopeId = record.scopeItemId;
    if (!byScope.has(scopeId)) byScope.set(scopeId, []);
    byScope.get(scopeId)!.push(record);

    if (act.guid) {
      byGuid.set(act.guid, record);
    }
  }

  return { byScope, byGuid };
}

// ---------------------------------------------------------------------------
// Resolve a single ActivityRef
// ---------------------------------------------------------------------------

export function resolveActivityRef(
  ref: ActivityRef,
  scopeItemCode: string,
  index: ActivityIndex,
): ResolutionResult {
  // 1. GUID match (most stable)
  if (ref.guid) {
    const byGuid = index.byGuid.get(ref.guid);
    if (byGuid) {
      return { activityRef: ref, resolvedId: byGuid.id, resolvedBy: "guid" };
    }
  }

  const scopeActivities = index.byScope.get(scopeItemCode) ?? [];

  // 2. Exact title match within scope
  const exactMatches = scopeActivities.filter((a) => a.title === ref.title);
  if (exactMatches.length === 1) {
    return { activityRef: ref, resolvedId: exactMatches[0]!.id, resolvedBy: "exact_title" };
  }

  // 3. Title + processFlowName disambiguation
  if (ref.processFlowName && exactMatches.length > 1) {
    const flowMatch = exactMatches.find((a) => a.processFlowName === ref.processFlowName);
    if (flowMatch) {
      return { activityRef: ref, resolvedId: flowMatch.id, resolvedBy: "title_flow" };
    }
  }

  // If exact match found multiple and no flow disambiguation, take first
  if (exactMatches.length > 1) {
    return {
      activityRef: ref,
      resolvedId: exactMatches[0]!.id,
      resolvedBy: "exact_title",
      warning: `Multiple matches for "${ref.title}" in ${scopeItemCode}, took first`,
    };
  }

  // 4. Fuzzy substring match (last resort)
  for (const act of scopeActivities) {
    if (act.title.includes(ref.title) || ref.title.includes(act.title)) {
      return {
        activityRef: ref,
        resolvedId: act.id,
        resolvedBy: "fuzzy",
        warning: `Fuzzy match: "${ref.title}" → "${act.title}"`,
      };
    }
  }

  // Try colon format: "Group: Activity"
  const colonIdx = ref.title.indexOf(": ");
  if (colonIdx > 0) {
    const subTitle = ref.title.substring(colonIdx + 2);
    const colonMatch = scopeActivities.find((a) => a.title === subTitle);
    if (colonMatch) {
      return {
        activityRef: ref,
        resolvedId: colonMatch.id,
        resolvedBy: "fuzzy",
        warning: `Colon-split match: "${ref.title}" → "${subTitle}"`,
      };
    }
  }

  return { activityRef: ref, resolvedId: null, resolvedBy: "unresolved" };
}

// ---------------------------------------------------------------------------
// Resolve all refs in a manifest
// ---------------------------------------------------------------------------

export interface ManifestResolution {
  withinScope: {
    rule: WithinScopeRule;
    sourceId: string | null;
    targetId: string | null;
    warnings: string[];
  }[];
  crossScope: {
    rule: CrossScopeRule;
    sourceId: string | null;
    targetId: string | null;
    warnings: string[];
  }[];
  resolvedCount: number;
  unresolvedCount: number;
  warningCount: number;
}

export function resolveManifest(
  manifest: DependencyManifest,
  index: ActivityIndex,
): ManifestResolution {
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let warningCount = 0;

  const withinScope = manifest.withinScope.map((rule) => {
    const warnings: string[] = [];

    const sourceRes = resolveActivityRef(rule.source, rule.scopeItemCode, index);
    const targetRes = resolveActivityRef(rule.target, rule.scopeItemCode, index);

    if (sourceRes.warning) warnings.push(sourceRes.warning);
    if (targetRes.warning) warnings.push(targetRes.warning);
    if (warnings.length > 0) warningCount++;

    if (sourceRes.resolvedId && targetRes.resolvedId) {
      resolvedCount++;
    } else {
      unresolvedCount++;
      if (!sourceRes.resolvedId) {
        warnings.push(`Source unresolved: "${rule.source.title}" in ${rule.scopeItemCode}`);
      }
      if (!targetRes.resolvedId) {
        warnings.push(`Target unresolved: "${rule.target.title}" in ${rule.scopeItemCode}`);
      }
    }

    return {
      rule,
      sourceId: sourceRes.resolvedId,
      targetId: targetRes.resolvedId,
      warnings,
    };
  });

  const crossScope = manifest.crossScope.map((rule) => {
    const warnings: string[] = [];

    const sourceRes = resolveActivityRef(rule.source, rule.sourceScopeCode, index);
    const targetRes = resolveActivityRef(rule.target, rule.targetScopeCode, index);

    if (sourceRes.warning) warnings.push(sourceRes.warning);
    if (targetRes.warning) warnings.push(targetRes.warning);
    if (warnings.length > 0) warningCount++;

    if (sourceRes.resolvedId && targetRes.resolvedId) {
      resolvedCount++;
    } else {
      unresolvedCount++;
      // Cross-scope rules with null activity refs are scope-level only — not an error
      if (rule.source.guid === null && rule.source.title.startsWith("Shared ")) {
        // Scope-level rule, no activity resolution needed
        resolvedCount++;
        unresolvedCount--; // Undo the increment above
      }
    }

    return {
      rule,
      sourceId: sourceRes.resolvedId,
      targetId: targetRes.resolvedId,
      warnings,
    };
  });

  return { withinScope, crossScope, resolvedCount, unresolvedCount, warningCount };
}
