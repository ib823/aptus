import type { NotificationType } from "@/types/notification";

export interface NotificationEventConfig {
  title: (ctx: Record<string, string>) => string;
  body: (ctx: Record<string, string>) => string;
  priority: "low" | "normal" | "high";
  defaultChannels: ("in_app" | "email" | "push")[];
}

/**
 * Maps each notification type to its template config.
 * Used by the dispatcher for email subject/body generation.
 */
export const NOTIFICATION_EVENT_MAP: Record<NotificationType, NotificationEventConfig> = {
  step_classified: {
    title: (ctx) => `Step classified by ${ctx.actorName ?? "a team member"}`,
    body: (ctx) => `Step "${ctx.stepTitle ?? "unknown"}" was classified as ${ctx.fitStatus ?? "unknown"} in ${ctx.assessmentName ?? "an assessment"}.`,
    priority: "normal",
    defaultChannels: ["in_app"],
  },
  gap_created: {
    title: () => "New gap identified",
    body: (ctx) => `A new gap was identified in ${ctx.scopeItemName ?? "a scope item"}: ${ctx.gapDescription ?? "No description"}.`,
    priority: "normal",
    defaultChannels: ["in_app", "email"],
  },
  comment_mention: {
    title: (ctx) => `${ctx.actorName ?? "Someone"} mentioned you in a comment`,
    body: (ctx) => ctx.commentPreview ?? "You were mentioned in a comment.",
    priority: "normal",
    defaultChannels: ["in_app", "email", "push"],
  },
  comment_reply: {
    title: (ctx) => `${ctx.actorName ?? "Someone"} replied to your comment`,
    body: (ctx) => ctx.commentPreview ?? "Someone replied to your comment.",
    priority: "normal",
    defaultChannels: ["in_app", "push"],
  },
  workshop_invite: {
    title: () => "Workshop invitation",
    body: (ctx) => `You've been invited to the workshop "${ctx.workshopTitle ?? "Untitled"}" scheduled for ${ctx.scheduledDate ?? "TBD"}.`,
    priority: "normal",
    defaultChannels: ["in_app", "email", "push"],
  },
  workshop_starting: {
    title: () => "Workshop starting soon",
    body: (ctx) => `The workshop "${ctx.workshopTitle ?? "Untitled"}" is starting in ${ctx.minutesUntilStart ?? "a few"} minutes.`,
    priority: "high",
    defaultChannels: ["in_app", "push"],
  },
  status_change: {
    title: () => "Assessment status updated",
    body: (ctx) => `Assessment "${ctx.assessmentName ?? ""}" moved from ${ctx.fromStatus ?? "unknown"} to ${ctx.toStatus ?? "unknown"} by ${ctx.actorName ?? "a team member"}.`,
    priority: "normal",
    defaultChannels: ["in_app", "email"],
  },
  phase_completed: {
    title: () => "Phase completed",
    body: (ctx) => `Phase ${ctx.phaseName ?? "unknown"} has been completed for ${ctx.assessmentName ?? "an assessment"}.`,
    priority: "normal",
    defaultChannels: ["in_app", "email"],
  },
  phase_blocked: {
    title: () => "Phase blocked",
    body: (ctx) => `Phase ${ctx.phaseName ?? "unknown"} is blocked: ${ctx.blockReason ?? "unresolved dependencies"}.`,
    priority: "high",
    defaultChannels: ["in_app", "email", "push"],
  },
  conflict_detected: {
    title: () => "Classification conflict detected",
    body: (ctx) => `A conflict was detected on ${ctx.entityType ?? "an entity"} "${ctx.entityId ?? ""}". Multiple reviewers have different classifications.`,
    priority: "high",
    defaultChannels: ["in_app", "email", "push"],
  },
  conflict_resolved: {
    title: () => "Conflict resolved",
    body: (ctx) => `The conflict on ${ctx.entityType ?? "an entity"} "${ctx.entityId ?? ""}" has been resolved by ${ctx.actorName ?? "a reviewer"}.`,
    priority: "normal",
    defaultChannels: ["in_app", "email"],
  },
  sign_off_request: {
    title: () => "Sign-off requested",
    body: (ctx) => `Your sign-off is requested for assessment "${ctx.assessmentName ?? ""}". Please review and approve.`,
    priority: "high",
    defaultChannels: ["in_app", "email", "push"],
  },
  deadline_reminder: {
    title: () => "Deadline approaching",
    body: (ctx) => `Assessment "${ctx.assessmentName ?? ""}" has a deadline in ${ctx.daysRemaining ?? "a few"} day(s).`,
    priority: "high",
    defaultChannels: ["in_app", "email", "push"],
  },
  stakeholder_added: {
    title: () => "You've been added to an assessment",
    body: (ctx) => `You've been added as a ${ctx.role ?? "stakeholder"} to ${ctx.assessmentName ?? "an assessment"} by ${ctx.actorName ?? "an administrator"}.`,
    priority: "normal",
    defaultChannels: ["in_app", "email"],
  },
  stakeholder_removed: {
    title: () => "Removed from assessment",
    body: (ctx) => `You've been removed from ${ctx.assessmentName ?? "an assessment"} by ${ctx.actorName ?? "an administrator"}.`,
    priority: "high",
    defaultChannels: ["in_app", "email"],
  },
};
