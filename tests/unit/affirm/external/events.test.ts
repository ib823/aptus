/**
 * Unit tests for the Affirm external audit event vocabulary.
 */

import { describe, expect, it } from "vitest";
import { AFFIRM_GUEST_EVENT_TYPES, isAffirmGuestEventType } from "@/lib/affirm/external/events";

describe("affirm guest event vocabulary", () => {
  it("recognizes every declared type", () => {
    for (const t of AFFIRM_GUEST_EVENT_TYPES) expect(isAffirmGuestEventType(t)).toBe(true);
  });
  it("rejects unknown types", () => {
    expect(isAffirmGuestEventType("bundle_created")).toBe(false); // internal, not guest
    expect(isAffirmGuestEventType("nonsense")).toBe(false);
  });
  it("covers the spec-mandated guest event set", () => {
    for (const t of [
      "grant_created",
      "grant_revoked",
      "grant_reissued",
      "grant_acknowledged",
      "otp_issued",
      "otp_verified",
      "otp_lockout",
      "guest_session_started",
      "guest_session_ended",
      "guest_answer_saved",
      "guest_submitted",
      "external_action_denied",
    ]) {
      expect(isAffirmGuestEventType(t)).toBe(true);
    }
  });
});
