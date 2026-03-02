/**
 * Phase: Dependency Engine — Warning evaluation.
 *
 * Evaluates WARN_IF_ALL_SOURCES_NA within-scope warnings
 * and WARN_ONLY cross-scope warnings.
 */

import { prisma } from "@/lib/db/prisma";
import type { DependencyGraph } from "./dependency-graph";
import type { DependencyWarning } from "./types";
import type { CrossScopeDependency } from "@prisma/client";

/**
 * Check whether ALL the given activities have all their classifiable steps
 * marked as NA within the specified assessment.
 */
async function checkAllActivitiesNA(
  assessmentId: string,
  activityIds: string[],
): Promise<boolean> {
  if (activityIds.length === 0) return false;

  for (const activityId of activityIds) {
    const steps = await prisma.processStep.findMany({
      where: { activityId, isClassifiable: true },
      select: { id: true },
    });

    if (steps.length === 0) continue; // No classifiable steps — skip

    const responses = await prisma.stepResponse.findMany({
      where: {
        assessmentId,
        processStepId: { in: steps.map((s) => s.id) },
      },
      select: { fitStatus: true },
    });

    // If not all steps have responses, the activity is not fully NA
    if (responses.length < steps.length) return false;
    if (!responses.every((r) => r.fitStatus === "NA")) return false;
  }

  return true;
}

export async function evaluateWarnings(
  graph: DependencyGraph,
  assessmentId: string,
  triggerActivityId: string,
  crossScopeDeps: CrossScopeDependency[],
): Promise<DependencyWarning[]> {
  const warnings: DependencyWarning[] = [];

  // 1. Within-scope WARN_IF_ALL_SOURCES_NA
  const warnEdges = graph.getWarnTargets(triggerActivityId);
  for (const edge of warnEdges) {
    // Get ALL sources for this target that use WARN_IF_ALL_SOURCES_NA
    const allSources = graph
      .getUpstream(edge.targetActivityId)
      .filter((e) => e.propagationRule === "WARN_IF_ALL_SOURCES_NA");

    const allSourcesNA = await checkAllActivitiesNA(
      assessmentId,
      allSources.map((e) => e.sourceActivityId),
    );

    if (allSourcesNA) {
      const targetNode = graph.getNode(edge.targetActivityId);
      warnings.push({
        activityId: edge.targetActivityId,
        activityTitle: targetNode?.activityTitle ?? "",
        scopeItemCode: targetNode?.scopeItemCode ?? graph.scopeItemCode,
        warningType: "WARN_SOFT",
        businessReason: edge.businessReason,
        sourceActivities: allSources.map((e) => e.sourceActivityId),
      });
    }
  }

  // 2. Cross-scope WARN_ONLY
  for (const crossDep of crossScopeDeps) {
    if (crossDep.sourceActivityId === triggerActivityId) {
      warnings.push({
        activityId: crossDep.targetActivityId,
        activityTitle: "", // Resolved by API caller
        scopeItemCode: crossDep.targetScopeCode,
        warningType: "WARN_CROSS_SCOPE",
        businessReason: crossDep.businessReason,
        sourceActivities: [crossDep.sourceActivityId],
      });
    }
  }

  return warnings;
}
