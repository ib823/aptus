export type NotificationType =
  | "step_classified"
  | "gap_created"
  | "comment_mention"
  | "comment_reply"
  | "workshop_invite"
  | "workshop_starting"
  | "status_change"
  | "phase_completed"
  | "phase_blocked"
  | "conflict_detected"
  | "conflict_resolved"
  | "sign_off_request"
  | "deadline_reminder"
  | "stakeholder_added"
  | "stakeholder_removed";

export type NotificationChannel = "in_app" | "email" | "push";
export type NotificationStatus = "unread" | "read" | "dismissed";

export type CommentTargetType = "STEP" | "GAP" | "SCOPE_ITEM" | "INTEGRATION" | "DATA_MIGRATION" | "OCM";
export type CommentStatus = "OPEN" | "RESOLVED";
export type ConflictStatus = "OPEN" | "IN_DISCUSSION" | "ESCALATED" | "RESOLVED";

export type ActivityActionType =
  | "classified_steps"
  | "added_gap"
  | "resolved_gap"
  | "commented"
  | "mentioned"
  | "conflict_detected"
  | "conflict_resolved"
  | "workshop_completed"
  | "scope_changed"
  | "sign_off_submitted"
  | "status_changed"
  | "phase_updated";

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  step_classified: "Step classified",
  gap_created: "Gap created",
  comment_mention: "@Mention in comment",
  comment_reply: "Comment reply",
  workshop_invite: "Workshop invite",
  workshop_starting: "Workshop starting",
  status_change: "Status change",
  phase_completed: "Phase completed",
  phase_blocked: "Phase blocked",
  conflict_detected: "Conflict detected",
  conflict_resolved: "Conflict resolved",
  sign_off_request: "Sign-off requested",
  deadline_reminder: "Deadline approaching",
  stakeholder_added: "Stakeholder added",
  stakeholder_removed: "Stakeholder removed",
};

// Types that cannot have in_app channel disabled
export const FORCED_IN_APP_TYPES: NotificationType[] = [
  "sign_off_request",
  "conflict_detected",
  "stakeholder_removed",
];

export const ALL_NOTIFICATION_TYPES: NotificationType[] = Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[];
