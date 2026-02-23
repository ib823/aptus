import { prisma } from "@/lib/db/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { resolveRecipients } from "@/lib/notifications/recipient-resolver";

/**
 * Detect and manage classification conflicts.
 * When multiple reviewers classify the same entity differently, creates/updates a Conflict record.
 * Auto-resolves when classifications converge.
 */
export async function detectConflict(params: {
  assessmentId: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  classification: string;
}): Promise<void> {
  const { assessmentId, entityType, entityId, userId, userName, classification } = params;

  // Get existing conflict for this entity
  const existing = await prisma.conflict.findFirst({
    where: {
      assessmentId,
      entityType,
      entityId,
      status: { in: ["OPEN", "IN_DISCUSSION", "ESCALATED"] },
    },
  });

  // Get all classifications for this entity from step responses
  const stepResponses = await prisma.stepResponse.findMany({
    where: {
      assessmentId,
      processStepId: entityId,
    },
    select: {
      respondent: true,
      fitStatus: true,
    },
  });

  // Build classifications map: userId -> classification
  const classifications: Record<string, string> = {};
  for (const sr of stepResponses) {
    if (sr.respondent) {
      classifications[sr.respondent] = sr.fitStatus;
    }
  }
  // Add the current user's classification
  classifications[userId] = classification;

  // Check for divergence: more than one distinct non-PENDING classification
  const uniqueClassifications = [...new Set(
    Object.values(classifications).filter((c) => c !== "PENDING"),
  )];

  if (uniqueClassifications.length > 1) {
    // Divergence detected — create or update conflict
    if (existing) {
      await prisma.conflict.update({
        where: { id: existing.id },
        data: {
          classifications: classifications as Record<string, string>,
        },
      });
    } else {
      await prisma.conflict.create({
        data: {
          assessmentId,
          entityType,
          entityId,
          classifications: classifications as Record<string, string>,
          status: "OPEN",
        },
      });

      // Notify stakeholders about new conflict
      const recipientIds = await resolveRecipients(assessmentId, "conflict_detected", {
        excludeUserId: userId,
      });

      if (recipientIds.length > 0) {
        dispatchNotification({
          type: "conflict_detected",
          assessmentId,
          title: "Classification conflict detected",
          body: `${userName} classified ${entityType} differently from other reviewers.`,
          deepLink: `/assessment/${assessmentId}/review?conflict=${entityId}`,
          recipientUserIds: recipientIds,
          priority: "high",
        }).catch(() => { /* fire-and-forget */ });
      }
    }
  } else if (uniqueClassifications.length <= 1 && existing) {
    // Convergence — auto-resolve
    await prisma.conflict.update({
      where: { id: existing.id },
      data: {
        status: "RESOLVED",
        resolvedClassification: uniqueClassifications[0] ?? null,
        resolutionNotes: "Auto-resolved: classifications converged.",
        resolvedAt: new Date(),
      },
    });
  }
}
