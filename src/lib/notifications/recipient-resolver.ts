import { prisma } from "@/lib/db/prisma";
import type { NotificationType } from "@/types/notification";

/**
 * Resolves the list of user IDs who should receive a notification
 * for a given event type on an assessment.
 *
 * Queries AssessmentStakeholder to determine recipients based on role and event type.
 */
export async function resolveRecipients(
  assessmentId: string,
  eventType: NotificationType,
  context?: { excludeUserId?: string },
): Promise<string[]> {
  // Get all stakeholders for the assessment
  const stakeholders = await prisma.assessmentStakeholder.findMany({
    where: { assessmentId },
    select: { userId: true, role: true },
  });

  let recipientIds: string[];

  // Determine recipients based on event type
  switch (eventType) {
    // High-priority events go to all stakeholders
    case "sign_off_request":
    case "status_change":
    case "phase_completed":
    case "phase_blocked":
    case "conflict_detected":
    case "deadline_reminder":
      recipientIds = stakeholders.map((s) => s.userId);
      break;

    // Gap events go to leads and managers
    case "gap_created":
    case "conflict_resolved":
      recipientIds = stakeholders
        .filter((s) =>
          ["partner_lead", "partner_manager", "client_lead", "client_admin", "platform_admin"].includes(s.role),
        )
        .map((s) => s.userId);
      break;

    // Step classification events go to leads only
    case "step_classified":
      recipientIds = stakeholders
        .filter((s) => ["partner_lead", "client_lead"].includes(s.role))
        .map((s) => s.userId);
      break;

    // Workshop events go to all stakeholders
    case "workshop_invite":
    case "workshop_starting":
      recipientIds = stakeholders.map((s) => s.userId);
      break;

    // Stakeholder events go to admins
    case "stakeholder_added":
    case "stakeholder_removed":
      recipientIds = stakeholders
        .filter((s) => ["client_admin", "platform_admin", "partner_manager"].includes(s.role))
        .map((s) => s.userId);
      break;

    // Comment notifications are handled inline (mention/reply targets specific users)
    case "comment_mention":
    case "comment_reply":
      recipientIds = [];
      break;

    default:
      recipientIds = stakeholders.map((s) => s.userId);
      break;
  }

  // Exclude the actor (don't notify yourself)
  if (context?.excludeUserId) {
    recipientIds = recipientIds.filter((id) => id !== context.excludeUserId);
  }

  // Deduplicate
  return [...new Set(recipientIds)];
}
