/**
 * ABeam Workbench — Presales audit event types.
 *
 * `PresalesAuditEvent.eventType` is stored as `String` in Prisma so we can
 * append new event types without a migration. This union is the authority:
 * persistence sites must use {@link assertEventType} to gate writes.
 *
 * The four marked `// R4` were appended in the Pass-1 → schema-refinement
 * round. Total = 32 values.
 */

export const PRESALES_AUDIT_EVENT_TYPES = [
  // Consultant-side (actorUserId set)
  'bundle_created',
  'bundle_sent', // load-bearing: triggers R1 snapshot lock
  'bundle_extended',
  'bundle_revoked',
  'bundle_expired_swept',
  'bundle_branding_updated', // R4
  'grant_created',
  'grant_reissued',
  'grant_revoked',
  'grant_email_corrected', // R4
  'preview_started',
  'pdf_emailed', // R4

  // Guest-side, redemption flow (grantId set)
  'landing_viewed',
  'otp_sent',
  'otp_verified',
  'otp_failed',
  'grant_acknowledged',
  'session_started',
  'external_action_denied', // R4 — fired on otp_exhausted (see guards.ts)

  // Guest-side, in-session
  'scope_viewed',
  'decision_set',
  'decision_changed',
  'decision_cleared',
  'scope_marked_complete',
  'session_ended',
  'session_idled',
  'session_expired',

  // Signoff
  'signoff_previewed',
  'signoff_completed',
  'signoff_aborted',
  'signoff_within_grace',
  'pdf_generated',
  'pdf_downloaded',

  // Post-signoff (added in autonomous build)
  // change_request_submitted — written when a portal consultant submits a
  //   post-signoff change request via /presales/[bundleId]/change-request.
  //   The signed bundle stays immutable; the CR routes through the
  //   Assessment-level change workflow.
  'change_request_submitted',
] as const;

export type PresalesAuditEventType = (typeof PRESALES_AUDIT_EVENT_TYPES)[number];

const EVENT_TYPE_SET = new Set<string>(PRESALES_AUDIT_EVENT_TYPES);

export function isPresalesAuditEventType(value: string): value is PresalesAuditEventType {
  return EVENT_TYPE_SET.has(value);
}

export function assertEventType(value: string): asserts value is PresalesAuditEventType {
  if (!EVENT_TYPE_SET.has(value)) {
    throw new Error(`Unknown PresalesAuditEvent.eventType: ${value}`);
  }
}
