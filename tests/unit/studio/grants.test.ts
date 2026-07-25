/**
 * Grant governance rules.
 *
 * These are the controls that make the ledger worth keeping, so they are tested
 * exhaustively rather than sampled: a decision that skipped segregation of
 * duties, or a WRITE approved without its checklist, is a governance failure
 * that would sail through a happy-path integration test.
 */

import { describe, expect, it } from "vitest";

import {
  DECIDABLE,
  ENVIRONMENT_ORDER,
  effectiveDecision,
  evaluateDecision,
  highestApprovedEnvironment,
  isExpired,
  isGranting,
  isWriteOperation,
  type DecisionRequest,
  type GrantDecision,
} from "@/lib/studio/grants";

function base(overrides: Partial<DecisionRequest> = {}): DecisionRequest {
  return {
    current: "REQUESTED",
    operation: "READ",
    environment: "DEV",
    requestedById: "u_requester",
    deciderId: "u_approver",
    next: "APPROVED",
    writeChecklistAcknowledged: false,
    ...overrides,
  };
}

describe("segregation of duties", () => {
  it("refuses a decision by the person who raised the request", () => {
    const r = evaluateDecision(base({ requestedById: "u_same", deciderId: "u_same" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("SELF_APPROVAL");
  });

  it("refuses self-approval for EVERY decision, including a rejection", () => {
    // Self-rejection is less dangerous but still bypasses the second pair of
    // eyes the ledger exists to guarantee.
    for (const next of DECIDABLE) {
      const r = evaluateDecision(base({ requestedById: "u_same", deciderId: "u_same", next }));
      expect(r.ok, `${next} by the requester must be refused`).toBe(false);
    }
  });

  it("allows a different person to decide", () => {
    expect(evaluateDecision(base()).ok).toBe(true);
  });

  it("does not block a legacy row with no recorded requester", () => {
    // Rows created before requestedById existed must remain decidable, or they
    // would be stuck in REQUESTED forever with no way to resolve them.
    expect(evaluateDecision(base({ requestedById: null })).ok).toBe(true);
  });
});

describe("the write gate", () => {
  it("refuses to approve a write without the checklist", () => {
    for (const operation of ["CREATE", "UPDATE"] as const) {
      const r = evaluateDecision(base({ operation, writeChecklistAcknowledged: false }));
      expect(r.ok, `${operation} must require the checklist`).toBe(false);
      if (!r.ok) expect(r.reason).toBe("WRITE_CHECKLIST_REQUIRED");
    }
  });

  it("refuses for every GRANTING decision, not just full approval", () => {
    // SANDBOX_ONLY and READ_ONLY still confer something; a write must not slip
    // through on a narrower-sounding decision.
    for (const next of ["APPROVED", "SANDBOX_ONLY", "READ_ONLY"] as const) {
      const r = evaluateDecision(base({ operation: "CREATE", next, writeChecklistAcknowledged: false }));
      expect(r.ok, `${next} for a write must require the checklist`).toBe(false);
    }
  });

  it("allows a write to be REJECTED without the checklist", () => {
    // Refusing something is always safe; requiring ceremony to say no would just
    // leave risky requests sitting open.
    expect(
      evaluateDecision(base({ operation: "CREATE", next: "REJECTED", writeChecklistAcknowledged: false })).ok,
    ).toBe(true);
  });

  it("allows a write once the checklist is acknowledged", () => {
    expect(
      evaluateDecision(base({ operation: "UPDATE", writeChecklistAcknowledged: true })).ok,
    ).toBe(true);
  });

  it("never requires the checklist for a plain read", () => {
    expect(evaluateDecision(base({ operation: "READ", writeChecklistAcknowledged: false })).ok).toBe(true);
  });

  it("classifies operations correctly", () => {
    expect(isWriteOperation("READ")).toBe(false);
    expect(isWriteOperation("CREATE")).toBe(true);
    expect(isWriteOperation("UPDATE")).toBe(true);
  });
});

describe("a grant is decided once", () => {
  it("refuses to re-decide a settled grant", () => {
    for (const current of ["APPROVED", "SANDBOX_ONLY", "READ_ONLY", "REJECTED", "EXPIRED"] as const) {
      const r = evaluateDecision(base({ current }));
      expect(r.ok, `${current} must not be re-decided`).toBe(false);
      if (!r.ok) expect(r.reason).toBe("NOT_PENDING");
    }
  });

  it("refuses EXPIRED as a hand-set decision — expiry is a consequence of time", () => {
    const r = evaluateDecision(base({ next: "EXPIRED" as GrantDecision }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_DECIDABLE");
  });

  it("refuses REQUESTED as a decision", () => {
    const r = evaluateDecision(base({ next: "REQUESTED" }));
    expect(r.ok).toBe(false);
  });
});

describe("granting classification", () => {
  it("treats APPROVED, SANDBOX_ONLY and READ_ONLY as granting", () => {
    expect(isGranting("APPROVED")).toBe(true);
    expect(isGranting("SANDBOX_ONLY")).toBe(true);
    expect(isGranting("READ_ONLY")).toBe(true);
  });

  it("treats REQUESTED, REJECTED and EXPIRED as not granting", () => {
    expect(isGranting("REQUESTED")).toBe(false);
    expect(isGranting("REJECTED")).toBe(false);
    expect(isGranting("EXPIRED")).toBe(false);
  });
});

describe("progressive trust reports state without gating", () => {
  it("returns the furthest environment that has a granting decision", () => {
    expect(
      highestApprovedEnvironment([
        { environment: "SANDBOX", decision: "APPROVED" },
        { environment: "TEST", decision: "READ_ONLY" },
        { environment: "DEV", decision: "APPROVED" },
      ]),
    ).toBe("TEST");
  });

  it("ignores environments that were only requested or rejected", () => {
    expect(
      highestApprovedEnvironment([
        { environment: "SANDBOX", decision: "APPROVED" },
        { environment: "PROD", decision: "REQUESTED" },
        { environment: "TEST", decision: "REJECTED" },
      ]),
    ).toBe("SANDBOX");
  });

  it("returns null when nothing is approved", () => {
    expect(highestApprovedEnvironment([{ environment: "PROD", decision: "REQUESTED" }])).toBeNull();
    expect(highestApprovedEnvironment([])).toBeNull();
  });

  it("does NOT refuse a PROD request just because TEST is unapproved", () => {
    // v1 describes trust; it does not enforce an order. No document defines that
    // policy, and inventing one here could block legitimate work.
    expect(evaluateDecision(base({ environment: "PROD" })).ok).toBe(true);
  });

  it("orders environments from least to most trusted", () => {
    expect(ENVIRONMENT_ORDER).toEqual(["SANDBOX", "DEV", "TEST", "PROD"]);
  });
});

describe("expiry", () => {
  const past = new Date("2026-01-01T00:00:00Z");
  const now = new Date("2026-06-01T00:00:00Z");
  const future = new Date("2026-12-01T00:00:00Z");

  it("expires a granting decision once its expiry has passed", () => {
    expect(isExpired({ decision: "APPROVED", expiresAt: past }, now)).toBe(true);
  });

  it("does not expire before the date", () => {
    expect(isExpired({ decision: "APPROVED", expiresAt: future }, now)).toBe(false);
  });

  it("never expires a grant with no expiry", () => {
    expect(isExpired({ decision: "APPROVED", expiresAt: null }, now)).toBe(false);
  });

  it("does not 'expire' something that never granted anything", () => {
    expect(isExpired({ decision: "REJECTED", expiresAt: past }, now)).toBe(false);
    expect(isExpired({ decision: "REQUESTED", expiresAt: past }, now)).toBe(false);
  });

  it("reads as EXPIRED for display without a sweep job having run", () => {
    // The screen must never show a stale "approved" merely because no background
    // task has caught up yet.
    expect(effectiveDecision({ decision: "APPROVED", expiresAt: past }, now)).toBe("EXPIRED");
    expect(effectiveDecision({ decision: "APPROVED", expiresAt: future }, now)).toBe("APPROVED");
  });
});
