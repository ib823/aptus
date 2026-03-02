/**
 * Phase: Dependency Engine — Propagation logger.
 *
 * Batch-creates DependencyPropagationLog entries and updates
 * StepResponse records within a single Prisma transaction.
 */

import { prisma } from "@/lib/db/prisma";
import type { PropagationAction } from "./types";

export async function applyPropagationActions(
  assessmentId: string,
  triggerStepId: string,
  propagations: PropagationAction[],
  userId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const prop of propagations) {
      for (const stepId of prop.affectedStepIds) {
        // Get current state for previousStatus
        const existing = await tx.stepResponse.findUnique({
          where: {
            assessmentId_processStepId: {
              assessmentId,
              processStepId: stepId,
            },
          },
          select: { fitStatus: true },
        });

        // Create log entry
        const log = await tx.dependencyPropagationLog.create({
          data: {
            assessmentId,
            triggerStepId,
            affectedStepId: stepId,
            dependencyId: prop.dependencyId,
            previousStatus: existing?.fitStatus ?? null,
            newStatus: "NA",
            propagationType: "AUTO_NA",
            createdBy: userId,
          },
        });

        // Upsert the StepResponse
        await tx.stepResponse.upsert({
          where: {
            assessmentId_processStepId: {
              assessmentId,
              processStepId: stepId,
            },
          },
          update: {
            fitStatus: "NA",
            isPropagated: true,
            propagatedFrom: log.id,
          },
          create: {
            assessmentId,
            processStepId: stepId,
            fitStatus: "NA",
            isPropagated: true,
            propagatedFrom: log.id,
          },
        });
      }
    }
  });
}
