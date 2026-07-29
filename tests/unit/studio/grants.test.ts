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
  grantsRead,
  grantsWrite,
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
    // A REAL DATE, because a bounded grant is now the norm. This defaulted to
    // null, so every test that was not about expiry was quietly exercising the
    // unbounded path and would now be refused for a reason it never meant to
    // assert.
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
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

  it("refuses for every decision that ACTUALLY authorises the write", () => {
    // Previously this looped over all three granting decisions, which encoded the
    // defect: it assumed READ_ONLY and SANDBOX_ONLY authorised a write and merely
    // needed ceremony first. They do not authorise one at all now, so there is
    // nothing for the checklist to gate — see the refusals below.
    const r = evaluateDecision(
      base({ operation: "CREATE", next: "APPROVED", writeChecklistAcknowledged: false }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("WRITE_CHECKLIST_REQUIRED");
  });

  it("a SANDBOX_ONLY write is allowed in SANDBOX, with the checklist and an expiry", () => {
    const r = evaluateDecision(
      base({
        operation: "CREATE",
        environment: "SANDBOX",
        next: "SANDBOX_ONLY",
        writeChecklistAcknowledged: true,
        expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("allows a write to be REJECTED without the checklist", () => {
    // Refusing something is always safe; requiring ceremony to say no would just
    // leave risky requests sitting open.
    expect(
      evaluateDecision(base({ operation: "CREATE", next: "REJECTED", writeChecklistAcknowledged: false })).ok,
    ).toBe(true);
  });

  it("allows a write once the checklist is acknowledged AND it is time-bounded", () => {
    expect(
      evaluateDecision(
        base({
          operation: "UPDATE",
          writeChecklistAcknowledged: true,
          expiresAt: new Date("2026-12-31T00:00:00.000Z"),
        }),
      ).ok,
    ).toBe(true);
  });

  it("refuses a write grant with no expiry — there is no revocation to fall back on", () => {
    const r = evaluateDecision(
      base({ operation: "UPDATE", writeChecklistAcknowledged: true, expiresAt: null }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("GRANT_REQUIRES_EXPIRY");
  });

  it("refuses a write grant whose expiry field was omitted entirely", () => {
    // A missing property is not a permission. The check is `== null` precisely so
    // an omitted field cannot slip past a control that a null would have caught.
    const req = base({ operation: "UPDATE", writeChecklistAcknowledged: true });
    delete (req as { expiresAt?: unknown }).expiresAt;
    const r = evaluateDecision(req);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("GRANT_REQUIRES_EXPIRY");
  });

  it("demands an expiry for a READ grant too", () => {
    /*
     * THIS TEST ASSERTED THE OPPOSITE, WITH A STATED RATIONALE: "Reads are
     * revocable in practice by the credential, and an unbounded read grant was
     * never the risk the expiry rule exists to close."
     *
     * The first half is not true, and the second follows from it. Revoking a
     * credential does not revoke a grant — it SUSPENDS the only means of using
     * one. The grant row stays APPROVED with no expiry, and the next credential
     * issued for that solution and environment reactivates it. Nothing in the
     * product ever ends it, which is why the grants API has always returned an
     * `unbounded` flag for exactly this shape and the manual calls it "a defect,
     * not a state".
     *
     * Credential revocation is also the wrong instrument: it is scoped to the
     * SOLUTION, so using it to end one over-broad read grant takes down every
     * other authorisation that solution holds.
     *
     * And a read is not a small thing to authorise forever. It is a standing
     * permission to pull a client's financial and master data out of their
     * production system. "We cannot revoke it, but it is only reading" is not an
     * answer anyone wants to give.
     *
     * If this rationale is ever revisited, THIS is the line to change — the rule
     * it guards is one condition in evaluateDecision.
     */
    const r = evaluateDecision(base({ operation: "READ", expiresAt: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("GRANT_REQUIRES_EXPIRY");
  });

  it("still lets a REJECTION through without an expiry — it authorises nothing", () => {
    // The rule is about authorisation, not about decisions. Demanding an expiry
    // on a refusal would be ceremony.
    expect(evaluateDecision(base({ next: "REJECTED", expiresAt: null })).ok).toBe(true);
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

/* ── runtime predicates: what a decision actually authorises ─────────────────
 *
 * These are the split that closed the hole. The broker previously asked only
 * `isGranting`, which cannot tell READ_ONLY from APPROVED — so "read only"
 * authorised a write, and a PROD grant decided SANDBOX_ONLY authorised PROD.
 * `isGranting` survives for the progressive-trust display and must never be
 * used on an access path again.
 */
describe("grantsWrite", () => {
  it("REFUSES a write on READ_ONLY, in every environment", () => {
    for (const env of ["SANDBOX", "DEV", "TEST", "PROD"] as const) {
      expect(grantsWrite("READ_ONLY", env), `READ_ONLY must not write in ${env}`).toBe(false);
    }
  });

  it("allows SANDBOX_ONLY only in SANDBOX", () => {
    expect(grantsWrite("SANDBOX_ONLY", "SANDBOX")).toBe(true);
    for (const env of ["DEV", "TEST", "PROD"] as const) {
      expect(grantsWrite("SANDBOX_ONLY", env), `SANDBOX_ONLY must not write in ${env}`).toBe(false);
    }
  });

  it("allows APPROVED everywhere — unchanged behaviour", () => {
    for (const env of ["SANDBOX", "DEV", "TEST", "PROD"] as const) {
      expect(grantsWrite("APPROVED", env)).toBe(true);
    }
  });

  it("refuses every non-granting decision", () => {
    for (const d of ["REQUESTED", "REJECTED", "EXPIRED"] as const) {
      expect(grantsWrite(d, "PROD")).toBe(false);
    }
  });
});

describe("grantsRead", () => {
  it("allows READ_ONLY — that is the decision's entire purpose", () => {
    expect(grantsRead("READ_ONLY", "PROD")).toBe(true);
  });

  it("allows SANDBOX_ONLY only in SANDBOX, on the read path too", () => {
    expect(grantsRead("SANDBOX_ONLY", "SANDBOX")).toBe(true);
    expect(grantsRead("SANDBOX_ONLY", "PROD")).toBe(false);
  });

  it("refuses every non-granting decision", () => {
    for (const d of ["REQUESTED", "REJECTED", "EXPIRED"] as const) {
      expect(grantsRead(d, "DEV")).toBe(false);
    }
  });
});
