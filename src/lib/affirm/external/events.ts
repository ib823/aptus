/**
 * ABeam Workbench — Affirm external (guest) audit event vocabulary.
 *
 * `AffirmEvent.type` is a plain String column, so new types append without a
 * migration. This union is the authority for the external executive journey.
 * Guest-side events carry `actorId: null` and `payload.grantId` (there is no
 * User actor). Consultant grant-management actions carry the consultant's
 * `actorId` and also stamp `payload.grantId`.
 *
 * The pre-existing internal affirm event types (bundle_created, scope_updated,
 * issued, submitted, released, released_record_generated, client_view_opened)
 * are declared elsewhere; this list is additive.
 */

export const AFFIRM_GUEST_EVENT_TYPES = [
  // Consultant grant management (actorId = consultant)
  "grant_created",
  "grant_revoked",
  "grant_reissued",

  // Guest redemption flow (actorId = null, payload.grantId set)
  "grant_acknowledged",
  "otp_issued",
  "otp_verified",
  "otp_lockout",
  "guest_session_started",
  "guest_session_ended",

  // Guest in-session
  "guest_answer_saved",
  "guest_submitted",

  // Denials / tampering (polymorphic; never oracles why)
  "external_action_denied",
] as const;

export type AffirmGuestEventType = (typeof AFFIRM_GUEST_EVENT_TYPES)[number];

const EVENT_TYPE_SET = new Set<string>(AFFIRM_GUEST_EVENT_TYPES);

export function isAffirmGuestEventType(value: string): value is AffirmGuestEventType {
  return EVENT_TYPE_SET.has(value);
}
