/** Phase 22: Apply conversation-derived classifications to step responses */

import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { logActivity } from "@/lib/collaboration/activity-logger";
import type { DerivedClassification } from "@/types/conversation";
import type { UserRole } from "@/types/assessment";
import type { InputJsonValue } from "@prisma/client/runtime/library";

export interface ApplyResult {
  applied: number;
  skipped: number;
  gapsCreated: number;
}

/**
 * Apply conversation-derived classifications to step responses.
 * - Skips steps that already have a non-PENDING response (don't overwrite manual work)
 * - Auto-creates GapResolution for GAP classifications
 * - Logs each applied classification to the decision log
 * - Runs all writes in a single transaction
 */
export async function applyClassifications(
  assessmentId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  sessionId: string,
  classifications: DerivedClassification[],
): Promise<ApplyResult> {
  let applied = 0;
  let skipped = 0;
  let gapsCreated = 0;

  await prisma.$transaction(async (tx) => {
    for (const dc of classifications) {
      // Check existing response
      const existing = await tx.stepResponse.findUnique({
        where: {
          assessmentId_processStepId: { assessmentId, processStepId: dc.processStepId },
        },
        select: { fitStatus: true },
      });

      // Skip if already classified (non-PENDING)
      if (existing && existing.fitStatus !== "PENDING") {
        skipped++;
        continue;
      }

      // Upsert step response
      await tx.stepResponse.upsert({
        where: {
          assessmentId_processStepId: { assessmentId, processStepId: dc.processStepId },
        },
        update: {
          fitStatus: dc.classification,
          respondent: userName,
          respondedAt: new Date(),
          confidence: dc.confidence,
          reviewedBy: userName,
          reviewedAt: new Date(),
        },
        create: {
          assessmentId,
          processStepId: dc.processStepId,
          fitStatus: dc.classification,
          respondent: userName,
          respondedAt: new Date(),
          confidence: dc.confidence,
          reviewedBy: userName,
          reviewedAt: new Date(),
        },
      });

      // Auto-create GapResolution for GAP classifications
      if (dc.classification === "GAP") {
        const step = await tx.processStep.findUnique({
          where: { id: dc.processStepId },
          select: { scopeItemId: true },
        });
        if (step) {
          const existingGap = await tx.gapResolution.findFirst({
            where: { assessmentId, processStepId: dc.processStepId },
          });
          if (!existingGap) {
            await tx.gapResolution.create({
              data: {
                assessmentId,
                processStepId: dc.processStepId,
                scopeItemId: step.scopeItemId,
                gapDescription: "Gap identified via Conversation Mode",
                resolutionType: "PENDING",
                resolutionDescription: "Pending resolution — auto-created from conversation classification",
              },
            });
            gapsCreated++;
          }
        }
      }

      applied++;
    }
  });

  // Fire-and-forget: decision log + activity for each applied classification
  for (const dc of classifications) {
    logDecision({
      assessmentId,
      entityType: "process_step",
      entityId: dc.processStepId,
      action: "CONVERSATION_CLASSIFICATION_APPLIED",
      newValue: { fitStatus: dc.classification, confidence: dc.confidence, sessionId } as unknown as InputJsonValue,
      actor: userName,
      actorRole: userRole,
      reason: `Classification derived from conversation session ${sessionId}`,
    }).catch(() => { /* fire-and-forget */ });
  }

  if (applied > 0) {
    logActivity({
      assessmentId,
      actorId: userId,
      actorName: userName,
      actorRole: userRole,
      actionType: "classified_steps",
      summary: `Applied ${applied} conversation-derived classifications (${skipped} skipped, ${gapsCreated} gaps created)`,
      entityType: "conversation_session",
      entityId: sessionId,
    }).catch(() => { /* fire-and-forget */ });
  }

  return { applied, skipped, gapsCreated };
}
