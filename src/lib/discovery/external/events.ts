/**
 * ABeam Workbench — Neutral Process Discovery (guest) audit event vocabulary.
 *
 * `DiscoveryEvent.type` is a plain String column, so new types append without a
 * migration. Guest-side events carry `actorId: null` and `payload.grantId`
 * (there is no User actor). Consultant grant-management actions carry the
 * consultant's `actorId` and also stamp `payload.grantId`.
 */

export const DISCOVERY_GUEST_EVENT_TYPES = [
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
  "guest_decision_saved",
  "guest_submitted",

  // Denials / tampering (polymorphic; never oracles why)
  "external_action_denied",
] as const;

export type DiscoveryGuestEventType = (typeof DISCOVERY_GUEST_EVENT_TYPES)[number];

const EVENT_TYPE_SET = new Set<string>(DISCOVERY_GUEST_EVENT_TYPES);

export function isDiscoveryGuestEventType(value: string): value is DiscoveryGuestEventType {
  return EVENT_TYPE_SET.has(value);
}
