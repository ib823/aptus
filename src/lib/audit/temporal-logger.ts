/**
 * Temporal Auditing Logger
 * Capture deep snapshots of assessment decisions for time-travel auditing.
 */

import { prisma } from "@/lib/db/prisma";

interface LogParams {
  stepResponseId: string;
  actorId: string;
  actorName: string;
  actionType: "CREATED" | "UPDATED" | "DELETED";
  previousStatus?: string;
  newStatus: string;
  previousNote?: string | null;
  newNote?: string | null;
  metadata?: any;
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
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        previousNote: params.previousNote,
        newNote: params.newNote,
        metadata: params.metadata || {},
      },
    });
  } catch (error) {
    // Audit logging should not crash the main transaction, but we log the failure
    console.error("[AUDIT] Failed to record temporal history:", error);
  }
}
