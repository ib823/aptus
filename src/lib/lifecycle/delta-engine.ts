/** Delta engine for snapshot comparison — pure functions, no DB dependencies */

import type { SnapshotData } from "@/types/signoff";
import type {
  DeltaReport,
  DeltaSummary,
  ScopeChange,
  ClassificationChange,
  GapResolutionChange,
  IntegrationChange,
  DataMigrationChange,
  UnlockedEntity,
  ImpactSummary,
} from "@/types/lifecycle";

/**
 * Compute a full delta report between two snapshots.
 * Compares scope selections, step responses, gap resolutions,
 * integration points, and data migration objects by ID matching.
 */
export function computeDeltaReport(
  baseSnapshot: SnapshotData,
  compareSnapshot: SnapshotData,
): DeltaReport {
  return {
    baseVersion: 0, // Caller should set these from snapshot metadata
    compareVersion: 0,
    computedAt: new Date().toISOString(),
    scopeChanges: computeScopeChanges(baseSnapshot, compareSnapshot),
    classificationChanges: computeClassificationChanges(baseSnapshot, compareSnapshot),
    gapResolutionChanges: computeGapResolutionChanges(baseSnapshot, compareSnapshot),
    integrationChanges: computeIntegrationChanges(baseSnapshot, compareSnapshot),
    dataMigrationChanges: computeDataMigrationChanges(baseSnapshot, compareSnapshot),
  };
}

/**
 * Compute summary statistics from a delta report.
 */
export function computeDeltaSummary(delta: DeltaReport): DeltaSummary {
  const scopeAdded = delta.scopeChanges.filter(c => c.changeType === "added").length;
  const scopeRemoved = delta.scopeChanges.filter(c => c.changeType === "removed").length;
  const scopeModified = delta.scopeChanges.filter(c => c.changeType === "modified").length;

  const classificationsChanged = delta.classificationChanges.length;

  const gapResolutionsAdded = delta.gapResolutionChanges.filter(c => c.changeType === "added").length;
  const gapResolutionsRemoved = delta.gapResolutionChanges.filter(c => c.changeType === "removed").length;
  const gapResolutionsModified = delta.gapResolutionChanges.filter(c => c.changeType === "modified").length;

  const integrationsAdded = delta.integrationChanges.filter(c => c.changeType === "added").length;
  const integrationsRemoved = delta.integrationChanges.filter(c => c.changeType === "removed").length;
  const integrationsModified = delta.integrationChanges.filter(c => c.changeType === "modified").length;

  const dataMigrationAdded = delta.dataMigrationChanges.filter(c => c.changeType === "added").length;
  const dataMigrationRemoved = delta.dataMigrationChanges.filter(c => c.changeType === "removed").length;
  const dataMigrationModified = delta.dataMigrationChanges.filter(c => c.changeType === "modified").length;

  const totalChanges =
    delta.scopeChanges.length +
    classificationsChanged +
    delta.gapResolutionChanges.length +
    delta.integrationChanges.length +
    delta.dataMigrationChanges.length;

  return {
    totalChanges,
    scopeAdded,
    scopeRemoved,
    scopeModified,
    classificationsChanged,
    gapResolutionsAdded,
    gapResolutionsRemoved,
    gapResolutionsModified,
    integrationsAdded,
    integrationsRemoved,
    integrationsModified,
    dataMigrationAdded,
    dataMigrationRemoved,
    dataMigrationModified,
  };
}

/**
 * Compute impact summary for a set of unlocked entities against snapshot data.
 */
export function computeImpactSummary(
  unlockedEntities: UnlockedEntity[],
  snapshotData: SnapshotData,
): ImpactSummary {
  const scopeChanges = unlockedEntities.filter(e => e.entityType === "scope_selection").length;
  const classificationChanges = unlockedEntities.filter(e => e.entityType === "step_response").length;
  const gapResolutionChanges = unlockedEntities.filter(e => e.entityType === "gap_resolution").length;
  const integrationChanges = unlockedEntities.filter(e => e.entityType === "integration").length;
  const totalEntitiesAffected = unlockedEntities.length;

  // Collect affected functional areas
  const areaSet = new Set<string>();
  for (const entity of unlockedEntities) {
    if (entity.functionalArea) {
      areaSet.add(entity.functionalArea);
    }
  }

  // Determine risk level based on scope of changes relative to total
  const totalScope = snapshotData.statistics.selectedScopeItems || 1;
  const changeRatio = totalEntitiesAffected / Math.max(totalScope, 1);

  let riskLevel: "low" | "medium" | "high" | "critical";
  if (changeRatio > 0.3 || totalEntitiesAffected > 50) {
    riskLevel = "critical";
  } else if (changeRatio > 0.15 || totalEntitiesAffected > 20) {
    riskLevel = "high";
  } else if (changeRatio > 0.05 || totalEntitiesAffected > 5) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  // Estimate rework days based on entity count (rough heuristic)
  const estimatedReworkDays = Math.ceil(
    scopeChanges * 0.5 +
    classificationChanges * 0.25 +
    gapResolutionChanges * 1.0 +
    integrationChanges * 2.0,
  );

  return {
    totalEntitiesAffected,
    scopeChanges,
    classificationChanges,
    gapResolutionChanges,
    integrationChanges,
    riskLevel,
    estimatedReworkDays,
    affectedFunctionalAreas: Array.from(areaSet),
  };
}

// ---- Internal helper functions ----

function computeScopeChanges(
  base: SnapshotData,
  compare: SnapshotData,
): ScopeChange[] {
  const changes: ScopeChange[] = [];
  const baseMap = new Map(base.scopeSelections.map(s => [s.scopeItemId, s]));
  const compareMap = new Map(compare.scopeSelections.map(s => [s.scopeItemId, s]));

  // Check for additions and modifications
  for (const [id, compareItem] of compareMap) {
    const baseItem = baseMap.get(id);
    if (!baseItem) {
      changes.push({
        scopeItemId: id,
        changeType: "added",
        newSelected: compareItem.selected,
        newRelevance: compareItem.relevance,
      });
    } else if (
      baseItem.selected !== compareItem.selected ||
      baseItem.relevance !== compareItem.relevance
    ) {
      changes.push({
        scopeItemId: id,
        changeType: "modified",
        previousSelected: baseItem.selected,
        newSelected: compareItem.selected,
        previousRelevance: baseItem.relevance,
        newRelevance: compareItem.relevance,
      });
    }
  }

  // Check for removals
  for (const [id] of baseMap) {
    if (!compareMap.has(id)) {
      const baseItem = baseMap.get(id)!;
      changes.push({
        scopeItemId: id,
        changeType: "removed",
        previousSelected: baseItem.selected,
        previousRelevance: baseItem.relevance,
      });
    }
  }

  return changes;
}

function computeClassificationChanges(
  base: SnapshotData,
  compare: SnapshotData,
): ClassificationChange[] {
  const changes: ClassificationChange[] = [];
  const baseMap = new Map(base.stepResponses.map(s => [s.processStepId, s]));
  const compareMap = new Map(compare.stepResponses.map(s => [s.processStepId, s]));

  for (const [id, compareItem] of compareMap) {
    const baseItem = baseMap.get(id);
    if (!baseItem) {
      changes.push({
        processStepId: id,
        changeType: "added",
        newFitStatus: compareItem.fitStatus,
        newConfidence: compareItem.confidence ?? undefined,
      });
    } else if (
      baseItem.fitStatus !== compareItem.fitStatus ||
      baseItem.confidence !== compareItem.confidence
    ) {
      changes.push({
        processStepId: id,
        changeType: "modified",
        previousFitStatus: baseItem.fitStatus,
        newFitStatus: compareItem.fitStatus,
        previousConfidence: baseItem.confidence ?? undefined,
        newConfidence: compareItem.confidence ?? undefined,
      });
    }
  }

  for (const [id] of baseMap) {
    if (!compareMap.has(id)) {
      const baseItem = baseMap.get(id)!;
      changes.push({
        processStepId: id,
        changeType: "removed",
        previousFitStatus: baseItem.fitStatus,
        previousConfidence: baseItem.confidence ?? undefined,
      });
    }
  }

  return changes;
}

function computeGapResolutionChanges(
  base: SnapshotData,
  compare: SnapshotData,
): GapResolutionChange[] {
  const changes: GapResolutionChange[] = [];
  const baseMap = new Map(base.gapResolutions.map(g => [g.id, g]));
  const compareMap = new Map(compare.gapResolutions.map(g => [g.id, g]));

  for (const [id, compareItem] of compareMap) {
    const baseItem = baseMap.get(id);
    if (!baseItem) {
      changes.push({
        gapResolutionId: id,
        changeType: "added",
        newResolutionType: compareItem.resolutionType,
        newPriority: compareItem.priority ?? undefined,
        newApproved: compareItem.clientApproved,
      });
    } else if (
      baseItem.resolutionType !== compareItem.resolutionType ||
      baseItem.priority !== compareItem.priority ||
      baseItem.clientApproved !== compareItem.clientApproved
    ) {
      changes.push({
        gapResolutionId: id,
        changeType: "modified",
        previousResolutionType: baseItem.resolutionType,
        newResolutionType: compareItem.resolutionType,
        previousPriority: baseItem.priority ?? undefined,
        newPriority: compareItem.priority ?? undefined,
        previousApproved: baseItem.clientApproved,
        newApproved: compareItem.clientApproved,
      });
    }
  }

  for (const [id] of baseMap) {
    if (!compareMap.has(id)) {
      const baseItem = baseMap.get(id)!;
      changes.push({
        gapResolutionId: id,
        changeType: "removed",
        previousResolutionType: baseItem.resolutionType,
        previousPriority: baseItem.priority ?? undefined,
        previousApproved: baseItem.clientApproved,
      });
    }
  }

  return changes;
}

function computeIntegrationChanges(
  base: SnapshotData,
  compare: SnapshotData,
): IntegrationChange[] {
  const changes: IntegrationChange[] = [];
  const baseMap = new Map(base.integrationPoints.map(i => [i.id, i]));
  const compareMap = new Map(compare.integrationPoints.map(i => [i.id, i]));

  for (const [id, compareItem] of compareMap) {
    const baseItem = baseMap.get(id);
    if (!baseItem) {
      changes.push({
        integrationId: id,
        changeType: "added",
        newStatus: compareItem.status,
        name: compareItem.name,
      });
    } else if (baseItem.status !== compareItem.status) {
      changes.push({
        integrationId: id,
        changeType: "modified",
        previousStatus: baseItem.status,
        newStatus: compareItem.status,
        name: compareItem.name,
      });
    }
  }

  for (const [id] of baseMap) {
    if (!compareMap.has(id)) {
      const baseItem = baseMap.get(id)!;
      changes.push({
        integrationId: id,
        changeType: "removed",
        previousStatus: baseItem.status,
        name: baseItem.name,
      });
    }
  }

  return changes;
}

function computeDataMigrationChanges(
  base: SnapshotData,
  compare: SnapshotData,
): DataMigrationChange[] {
  const changes: DataMigrationChange[] = [];
  const baseMap = new Map(base.dataMigrationObjects.map(d => [d.id, d]));
  const compareMap = new Map(compare.dataMigrationObjects.map(d => [d.id, d]));

  for (const [id, compareItem] of compareMap) {
    const baseItem = baseMap.get(id);
    if (!baseItem) {
      changes.push({
        dataMigrationId: id,
        changeType: "added",
        newStatus: compareItem.status,
        objectName: compareItem.objectName,
      });
    } else if (baseItem.status !== compareItem.status) {
      changes.push({
        dataMigrationId: id,
        changeType: "modified",
        previousStatus: baseItem.status,
        newStatus: compareItem.status,
        objectName: compareItem.objectName,
      });
    }
  }

  for (const [id] of baseMap) {
    if (!compareMap.has(id)) {
      const baseItem = baseMap.get(id)!;
      changes.push({
        dataMigrationId: id,
        changeType: "removed",
        previousStatus: baseItem.status,
        objectName: baseItem.objectName,
      });
    }
  }

  return changes;
}
