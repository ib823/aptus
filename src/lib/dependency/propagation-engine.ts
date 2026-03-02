/**
 * Phase: Dependency Engine — Core propagation engine.
 *
 * Invoked after a step classification is saved. Evaluates whether
 * the classification triggers auto-NA propagation or warnings on
 * downstream activities, and provides undo/reverse capabilities.
 */

import { prisma } from "@/lib/db/prisma";
import type { DependencyGraph } from "./dependency-graph";
import { getDependencyGraph, getCrossScopeDependencies } from "./dependency-loader";
import { evaluateWarnings } from "./dependency-warnings";
import { applyPropagationActions } from "./propagation-logger";
import type {
  PropagationResult,
  PropagationAction,
  UndoResult,
} from "./types";

export class PropagationEngine {
  private constructor(
    private readonly scopeItemCode: string,
    private readonly graph: DependencyGraph,
  ) {}

  static async forScope(scopeItemCode: string): Promise<PropagationEngine> {
    const graph = await getDependencyGraph(scopeItemCode);
    return new PropagationEngine(scopeItemCode, graph);
  }

  // -------------------------------------------------------------------------
  // Evaluate: determine propagation effects after a classification
  // -------------------------------------------------------------------------

  async evaluate(
    assessmentId: string,
    activityId: string,
    newClassification: string,
  ): Promise<PropagationResult> {
    const empty: PropagationResult = { propagations: [], warnings: [] };

    // Only NA triggers forward propagation
    if (newClassification !== "NA") return empty;

    // 1. TRIGGER DETECTION — check if the entire activity is now NA
    const allNA = await this.isActivityFullyNA(assessmentId, activityId);
    if (!allNA) return empty;

    // 2. DOWNSTREAM BFS — find all hard-propagation targets
    const targetActivityIds = this.graph.getHardPropagationTargets(activityId);
    if (targetActivityIds.size === 0 && this.graph.getWarnTargets(activityId).length === 0) {
      return empty;
    }

    // 3. BUILD PROPAGATION SET — for each target, collect affected steps
    const propagations: PropagationAction[] = [];

    for (const targetId of targetActivityIds) {
      const targetNode = this.graph.getNode(targetId);
      if (!targetNode) continue;

      // Find the dependency edge linking source → target (use first hard edge)
      const edge = targetNode.upstream.find(
        (e) =>
          targetActivityIds.has(e.sourceActivityId) ||
          e.sourceActivityId === activityId,
      );

      // Get classifiable steps for this target activity
      const steps = await prisma.processStep.findMany({
        where: { activityId: targetId, isClassifiable: true },
        select: { id: true },
      });

      if (steps.length === 0) continue;

      // Check which steps can be auto-propagated:
      // Only steps that are unclassified or already auto-propagated
      const stepIds = steps.map((s) => s.id);
      const existingResponses = await prisma.stepResponse.findMany({
        where: {
          assessmentId,
          processStepId: { in: stepIds },
        },
        select: { processStepId: true, isPropagated: true, fitStatus: true },
      });

      const manuallyClassified = new Set(
        existingResponses
          .filter((r) => !r.isPropagated)
          .map((r) => r.processStepId),
      );

      const affectedStepIds = stepIds.filter(
        (id) => !manuallyClassified.has(id),
      );

      if (affectedStepIds.length === 0) continue;

      propagations.push({
        activityId: targetId,
        activityTitle: targetNode.activityTitle,
        affectedStepIds,
        dependencyId: edge?.dependencyId ?? "",
        businessReason: edge?.businessReason ?? "Upstream activity marked as Not Applicable",
        propagationType: "AUTO_NA",
      });
    }

    // 4. GENERATE WARNINGS
    const crossScopeDeps = await getCrossScopeDependencies(this.scopeItemCode);
    const warnings = await evaluateWarnings(
      this.graph,
      assessmentId,
      activityId,
      crossScopeDeps,
    );

    return { propagations, warnings };
  }

  // -------------------------------------------------------------------------
  // Apply: write propagations to the database
  // -------------------------------------------------------------------------

  async applyPropagations(
    assessmentId: string,
    triggerStepId: string,
    propagations: PropagationAction[],
    userId: string,
  ): Promise<void> {
    await applyPropagationActions(
      assessmentId,
      triggerStepId,
      propagations,
      userId,
    );
  }

  // -------------------------------------------------------------------------
  // Undo: revert a specific propagation event
  // -------------------------------------------------------------------------

  async undoPropagation(
    assessmentId: string,
    propagationLogId: string,
    userId: string,
  ): Promise<UndoResult> {
    const undoneSteps: string[] = [];
    const cascadeUndone: string[] = [];

    // Find the log entry and its siblings (same trigger)
    const triggerLog = await prisma.dependencyPropagationLog.findUnique({
      where: { id: propagationLogId },
    });
    if (!triggerLog) return { undoneSteps, cascadeUndone };

    const relatedLogs = await prisma.dependencyPropagationLog.findMany({
      where: {
        assessmentId,
        triggerStepId: triggerLog.triggerStepId,
        undone: false,
      },
    });

    await prisma.$transaction(async (tx) => {
      for (const log of relatedLogs) {
        // Check if user manually overrode this step
        const response = await tx.stepResponse.findUnique({
          where: {
            assessmentId_processStepId: {
              assessmentId,
              processStepId: log.affectedStepId,
            },
          },
          select: { isPropagated: true, fitStatus: true },
        });

        // Skip if user manually overrode (isPropagated=false but has a classification)
        if (response && !response.isPropagated && response.fitStatus !== "NA") {
          continue;
        }

        // Check if other triggers still require this step to be NA
        const otherTriggers = await tx.dependencyPropagationLog.findMany({
          where: {
            affectedStepId: log.affectedStepId,
            assessmentId,
            undone: false,
            triggerStepId: { not: triggerLog.triggerStepId },
          },
          select: { id: true },
        });

        if (otherTriggers.length > 0) continue; // Other triggers still active

        // Mark the log as undone
        await tx.dependencyPropagationLog.update({
          where: { id: log.id },
          data: { undone: true, undoneAt: new Date(), undoneBy: userId },
        });

        // Reset the step response
        if (log.previousStatus) {
          await tx.stepResponse.update({
            where: {
              assessmentId_processStepId: {
                assessmentId,
                processStepId: log.affectedStepId,
              },
            },
            data: {
              fitStatus: log.previousStatus,
              isPropagated: false,
              propagatedFrom: null,
            },
          });
        } else {
          // No previous status — delete the response
          await tx.stepResponse.delete({
            where: {
              assessmentId_processStepId: {
                assessmentId,
                processStepId: log.affectedStepId,
              },
            },
          });
        }

        undoneSteps.push(log.affectedStepId);
      }
    });

    return { undoneSteps, cascadeUndone };
  }

  // -------------------------------------------------------------------------
  // Reverse: when a trigger activity changes FROM NA to something else
  // -------------------------------------------------------------------------

  async reversePropagation(
    assessmentId: string,
    activityId: string,
    userId: string,
  ): Promise<UndoResult> {
    const undoneSteps: string[] = [];
    const cascadeUndone: string[] = [];

    // Find all propagation logs triggered by steps in this activity
    const activitySteps = await prisma.processStep.findMany({
      where: { activityId, isClassifiable: true },
      select: { id: true },
    });

    const triggerStepIds = activitySteps.map((s) => s.id);
    if (triggerStepIds.length === 0) return { undoneSteps, cascadeUndone };

    const logs = await prisma.dependencyPropagationLog.findMany({
      where: {
        assessmentId,
        triggerStepId: { in: triggerStepIds },
        undone: false,
      },
    });

    if (logs.length === 0) return { undoneSteps, cascadeUndone };

    await prisma.$transaction(async (tx) => {
      for (const log of logs) {
        // Check if user manually overrode
        const response = await tx.stepResponse.findUnique({
          where: {
            assessmentId_processStepId: {
              assessmentId,
              processStepId: log.affectedStepId,
            },
          },
          select: { isPropagated: true, fitStatus: true },
        });

        if (response && !response.isPropagated) continue;

        // Check if other triggers still require NA
        const otherTriggers = await tx.dependencyPropagationLog.findMany({
          where: {
            affectedStepId: log.affectedStepId,
            assessmentId,
            undone: false,
            triggerStepId: { notIn: triggerStepIds },
          },
          select: { id: true },
        });

        if (otherTriggers.length > 0) continue;

        // Undo
        await tx.dependencyPropagationLog.update({
          where: { id: log.id },
          data: { undone: true, undoneAt: new Date(), undoneBy: userId },
        });

        if (log.previousStatus) {
          await tx.stepResponse.update({
            where: {
              assessmentId_processStepId: {
                assessmentId,
                processStepId: log.affectedStepId,
              },
            },
            data: {
              fitStatus: log.previousStatus,
              isPropagated: false,
              propagatedFrom: null,
            },
          });
        } else {
          await tx.stepResponse.deleteMany({
            where: {
              assessmentId,
              processStepId: log.affectedStepId,
              isPropagated: true,
            },
          });
        }

        undoneSteps.push(log.affectedStepId);
      }
    });

    return { undoneSteps, cascadeUndone };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async isActivityFullyNA(
    assessmentId: string,
    activityId: string,
  ): Promise<boolean> {
    const steps = await prisma.processStep.findMany({
      where: { activityId, isClassifiable: true },
      select: { id: true },
    });

    // Activities with 0 classifiable steps (info headers) — check if node
    // exists in graph; if it has downstream edges, treat as "group header" = NA
    if (steps.length === 0) {
      const node = this.graph.getNode(activityId);
      return node !== undefined && node.downstream.length > 0;
    }

    const stepIds = steps.map((s) => s.id);
    const responses = await prisma.stepResponse.findMany({
      where: {
        assessmentId,
        processStepId: { in: stepIds },
      },
      select: { fitStatus: true },
    });

    return (
      responses.length === steps.length &&
      responses.every((r) => r.fitStatus === "NA")
    );
  }
}
