import { prisma } from "@/lib/db/prisma";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import type { UserRole } from "@/types/assessment";
import type { NotificationType } from "@/types/notification";

/**
 * Which stakeholder roles receive which notifications.
 *
 * TYPED `UserRole[]`, AND NORMALISED BEFORE COMPARISON — because neither was
 * true and both mattered.
 *
 * `AssessmentStakeholder.role` is a bare `String` fed from two vocabularies: the
 * creating user's platform role (`POST /api/assessments`) and a narrower legacy
 * set from the stakeholders route, whose Zod enum still admits `"executive"`.
 * These filters compared raw strings against neither list properly, so:
 *
 *   - `partner_manager` and `client_lead` appeared in three of them and are not
 *     `UserRole` values at all. Nothing can write them, so those entries matched
 *     nobody, ever. `step_classified` in particular listed only `partner_lead`
 *     and `client_lead`, which made it a one-role rule that read like a two-role
 *     rule. They are removed rather than corrected: there is no evidence of what
 *     they were meant to be, and inventing an intent is worse than deleting a
 *     line that never fired.
 *   - a legacy `"executive"` row never matched `executive_sponsor`. Normalising
 *     through `mapLegacyRole` fixes that as a side effect of typing the lists.
 *
 * `support` is deliberately absent from every list. It is the operations
 * persona: it watches broker traffic and connection health, and has no seat on
 * an assessment. Adding it here to "complete the sweep" would send a role that
 * cannot open an assessment notifications about one.
 */
const NOTIFY_ON_GAP_EVENTS: readonly UserRole[] = [
  "partner_lead",
  "client_admin",
  "platform_admin",
];

const NOTIFY_ON_STEP_CLASSIFIED: readonly UserRole[] = ["partner_lead"];

const NOTIFY_ON_STAKEHOLDER_CHANGE: readonly UserRole[] = ["client_admin", "platform_admin"];

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
        .filter((s) => NOTIFY_ON_GAP_EVENTS.includes(mapLegacyRole(s.role)))
        .map((s) => s.userId);
      break;

    // Step classification events go to leads only
    case "step_classified":
      recipientIds = stakeholders
        .filter((s) => NOTIFY_ON_STEP_CLASSIFIED.includes(mapLegacyRole(s.role)))
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
        .filter((s) => NOTIFY_ON_STAKEHOLDER_CHANGE.includes(mapLegacyRole(s.role)))
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
