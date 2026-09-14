/**
 * Who may act in the CoreEdge console.
 *
 * WHY THIS MODULE EXISTS AT ALL, restated as a test so the reasoning survives:
 * `canMutateStudio` is the builder's capability and `platform_admin` is
 * deliberately false there. D4 gives revocation to a platform admin or a
 * reviewer, which Studio's gate cannot express — so CoreEdge names its own
 * capabilities rather than widening Studio's for a reason unrelated to Studio.
 *
 * "Reviewer" and "operator" are not roles in this repository. The design's
 * reviewer is the SoD constraint, its operator is the support persona. These
 * assert the translation.
 */

import { describe, expect, it } from "vitest";

import {
  isOperator,
  isPlatformAdmin,
  refuseDecision,
  refuseRecheck,
  refuseRevokeKey,
  refuseSendClaimLink,
} from "@/lib/coreedge/authz";
import { canMutateStudio } from "@/lib/studio/rbac";

const FUTURE = new Date("2027-01-01T00:00:00Z");

describe("the personas, translated", () => {
  it("treats support as the operator and platform_admin as the admin", () => {
    expect(isOperator("support")).toBe(true);
    expect(isOperator("consultant")).toBe(false);
    expect(isPlatformAdmin("platform_admin")).toBe(true);
    expect(isPlatformAdmin("consultant")).toBe(false);
  });

  it("is not a rename of canMutateStudio, and the difference is the point", () => {
    // If these ever agree, this module has lost its reason to exist — and a
    // platform admin has silently gained Studio's mutations.
    expect(canMutateStudio("platform_admin")).toBe(false);
    expect(refuseRevokeKey("platform_admin")).toBeNull();
  });

  it("says nothing about an absent role except that it may not act", () => {
    for (const role of [null, undefined, ""]) {
      expect(isPlatformAdmin(role)).toBe(false);
      expect(refuseDecision({ role, userId: "u", requestedById: "other", expiresAt: FUTURE }))
        .toBe("noPermission");
    }
  });
});

describe("deciding a request", () => {
  const base = { userId: "reviewer", requestedById: "raiser", expiresAt: FUTURE } as const;

  it("admits a platform admin and a builder", () => {
    expect(refuseDecision({ ...base, role: "platform_admin" })).toBeNull();
    expect(refuseDecision({ ...base, role: "consultant" })).toBeNull();
  });

  it("refuses everyone else, including the operator", () => {
    for (const role of ["support", "viewer", "project_manager", "client_admin"]) {
      expect(refuseDecision({ ...base, role }), role).toBe("noPermission");
    }
  });

  it("refuses the requester their own request", () => {
    // The reviewer IS this rule; there is no role that exempts anyone from it.
    expect(refuseDecision({ ...base, role: "platform_admin", requestedById: "reviewer" }))
      .toBe("ownRequest");
  });

  it("refuses a request with no end date", () => {
    expect(refuseDecision({ ...base, role: "platform_admin", expiresAt: null }))
      .toBe("missingExpiry");
  });

  it("reports the role before anything about the request", () => {
    /*
     * ORDER IS THE ARGUMENT. Someone who cannot decide at all should not be
     * told about the end date — that is a fact about a request they have no
     * business acting on.
     */
    expect(refuseDecision({ ...base, role: "viewer", expiresAt: null, requestedById: base.userId }))
      .toBe("noPermission");
  });

  it("reports self-approval before the missing end date", () => {
    // One is about this person and cannot be fixed; the other is about the
    // request and a permitted reviewer can fix it.
    expect(
      refuseDecision({ ...base, role: "consultant", requestedById: "reviewer", expiresAt: null }),
    ).toBe("ownRequest");
  });
});

describe("revoking a key — D4", () => {
  it("admits a platform admin and a reviewer", () => {
    expect(refuseRevokeKey("platform_admin")).toBeNull();
    expect(refuseRevokeKey("consultant")).toBeNull();
  });

  it("refuses the operator in the words that say what they do instead", () => {
    // "An operator flags and notifies." The screen goes further and does not
    // render the control for them at all.
    expect(refuseRevokeKey("support")).toBe("revokeNotOperator");
  });

  it("refuses everyone else", () => {
    for (const role of ["viewer", "project_manager", "executive_sponsor"]) {
      expect(refuseRevokeKey(role), role).toBe("noPermission");
    }
  });
});

describe("sending a claim link", () => {
  it("is the same people who decide", () => {
    // Splitting them would let someone approve access they cannot deliver.
    expect(refuseSendClaimLink("platform_admin")).toBeNull();
    expect(refuseSendClaimLink("consultant")).toBeNull();
    expect(refuseSendClaimLink("support")).toBe("noPermission");
    expect(refuseSendClaimLink("viewer")).toBe("noPermission");
  });
});

describe("re-checking a lane", () => {
  it("admits the operator too, deliberately", () => {
    /*
     * A re-check writes no governance state — it asks SAP a question this
     * product already asks nightly. The person watching a board is exactly who
     * needs it; rate limiting, not role, is what stops it being abused.
     */
    expect(refuseRecheck("support")).toBeNull();
    expect(refuseRecheck("platform_admin")).toBeNull();
    expect(refuseRecheck("consultant")).toBeNull();
  });

  it("still refuses a viewer", () => {
    expect(refuseRecheck("viewer")).toBe("noPermission");
  });
});
