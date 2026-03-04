/**
 * Temporal Auditing Logger
 * Capture deep snapshots of assessment decisions for time-travel auditing.
 */

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

interface LogParams {
  stepResponseId: string;
  actorId: string;
  actorName: string;
  actionType: "CREATED" | "UPDATED" | "DELETED";
  previousStatus?: string | null | undefined;
  newStatus: string;
  previousNote?: string | null | undefined;
  newNote?: string | null | undefined;
  metadata?: Record<string, unknown>;
}

/**
 * Records a granular history entry for a step response change.
 * This is the foundation for the "Decision Timeline" UI.
 */
export async function logStepResponseChange(params: LogParams) {
  try {
    return await prisma.stepResponseHistory.create({
      data: {
        stepResponseId: params.stepResponseId,
        actorId: params.actorId,
        actorName: params.actorName,
        actionType: params.actionType,
        previousStatus: params.previousStatus ?? null,
        newStatus: params.newStatus,
        previousNote: params.previousNote ?? null,
        newNote: params.newNote ?? null,
        metadata: (params.metadata as Prisma.InputJsonValue) || {},
      },
    });
  } catch (error) {
    // Audit logging should not crash the main transaction, but we log the failure
    console.error("[AUDIT] Failed to record temporal history:", error);
  }
}
