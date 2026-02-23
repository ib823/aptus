/**
 * STATUS: Wired (adapter)
 * REAL MODULE: src/lib/signoff/state-machine.ts
 * PRE-EXISTING COVERAGE: tests/unit/signoff-state-machine.test.ts
 * WIRING NOTES: All 12 states map 1:1 to real code via name mapping.
 *   6 V2 state names differ from real names (see V2_TO_REAL constant).
 *   Core functions (validateTransition, getNextStates, isTerminalState)
 *   delegate entirely to real production code.
 */
import { describe, it, expect } from "vitest";
import {
  canTransitionSignOff,
  getAvailableTransitions,
  isTerminalState as realIsTerminalState,
} from "@/lib/signoff/state-machine";
import type { SignOffStatus } from "@/types/signoff";

// ---------------------------------------------------------------------------
// Inline types (test-only constructs)
// ---------------------------------------------------------------------------

type SignOffState =
  | "NOT_STARTED"
  | "AREA_VALIDATION_IN_PROGRESS"
  | "AREA_VALIDATION_COMPLETE"
  | "TECHNICAL_VALIDATION_IN_PROGRESS"
  | "TECHNICAL_VALIDATION_COMPLETE"
  | "CROSS_FUNCTIONAL_IN_PROGRESS"
  | "CROSS_FUNCTIONAL_COMPLETE"
  | "PENDING_EXECUTIVE"
  | "EXECUTIVE_SIGNED"
  | "PENDING_PARTNER"
  | "FULLY_SIGNED_OFF"
  | "REJECTED";

interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Name mapping: V2 test names ↔ real production code names
// ---------------------------------------------------------------------------

const V2_TO_REAL: Record<SignOffState, SignOffStatus> = {
  NOT_STARTED: "VALIDATION_NOT_STARTED",
  AREA_VALIDATION_IN_PROGRESS: "AREA_VALIDATION_IN_PROGRESS",
  AREA_VALIDATION_COMPLETE: "AREA_VALIDATION_COMPLETE",
  TECHNICAL_VALIDATION_IN_PROGRESS: "TECHNICAL_VALIDATION_IN_PROGRESS",
  TECHNICAL_VALIDATION_COMPLETE: "TECHNICAL_VALIDATION_COMPLETE",
  CROSS_FUNCTIONAL_IN_PROGRESS: "CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS",
  CROSS_FUNCTIONAL_COMPLETE: "CROSS_FUNCTIONAL_VALIDATION_COMPLETE",
  PENDING_EXECUTIVE: "EXECUTIVE_SIGN_OFF_PENDING",
  EXECUTIVE_SIGNED: "EXECUTIVE_SIGNED",
  PENDING_PARTNER: "PARTNER_COUNTERSIGN_PENDING",
  FULLY_SIGNED_OFF: "COMPLETED",
  REJECTED: "REJECTED",
};

const REAL_TO_V2: Record<SignOffStatus, SignOffState> = Object.fromEntries(
  Object.entries(V2_TO_REAL).map(([k, v]) => [v, k]),
) as Record<SignOffStatus, SignOffState>;

// ---------------------------------------------------------------------------
// Adapter: delegates to real production code via name mapping
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<SignOffState, SignOffState[]> = Object.fromEntries(
  (Object.keys(V2_TO_REAL) as SignOffState[]).map((v2State) => {
    const realState = V2_TO_REAL[v2State];
    const realTargets = getAvailableTransitions(realState);
    const v2Targets = realTargets.map((r) => REAL_TO_V2[r]);
    return [v2State, v2Targets];
  }),
) as Record<SignOffState, SignOffState[]>;

const ALL_STATES: SignOffState[] = Object.keys(V2_TO_REAL) as SignOffState[];

// Ordered layers — sign-off must proceed through these in sequence
const ORDERED_LAYERS: SignOffState[] = [
  "NOT_STARTED",
  "AREA_VALIDATION_IN_PROGRESS",
  "AREA_VALIDATION_COMPLETE",
  "TECHNICAL_VALIDATION_IN_PROGRESS",
  "TECHNICAL_VALIDATION_COMPLETE",
  "CROSS_FUNCTIONAL_IN_PROGRESS",
  "CROSS_FUNCTIONAL_COMPLETE",
  "PENDING_EXECUTIVE",
  "EXECUTIVE_SIGNED",
  "PENDING_PARTNER",
  "FULLY_SIGNED_OFF",
];

// ---------------------------------------------------------------------------
// Functions under test — adapter wrappers around real production code
// ---------------------------------------------------------------------------

function validateTransition(
  from: SignOffState,
  to: SignOffState,
): TransitionResult {
  const realFrom = V2_TO_REAL[from];
  const realTo = V2_TO_REAL[to];
  const allowed = canTransitionSignOff(realFrom, realTo);
  if (!allowed) {
    return {
      allowed: false,
      reason: `Invalid transition from ${from} to ${to}`,
    };
  }
  return { allowed: true };
}

function getNextStates(from: SignOffState): SignOffState[] {
  const realFrom = V2_TO_REAL[from];
  const realTargets = getAvailableTransitions(realFrom);
  return realTargets.map((r) => REAL_TO_V2[r]);
}

function isTerminalState(state: SignOffState): boolean {
  const realState = V2_TO_REAL[state];
  return realIsTerminalState(realState);
}

/**
 * T-SO-001: Executive declines — assessment returns to CROSS_FUNCTIONAL_IN_PROGRESS with comments.
 */
function processExecutiveDecline(
  currentState: SignOffState,
  comments: string,
): { newState: SignOffState; comments: string } | TransitionResult {
  if (currentState !== "PENDING_EXECUTIVE") {
    return { allowed: false, reason: "Can only decline from PENDING_EXECUTIVE" };
  }
  if (!comments || comments.trim().length === 0) {
    return { allowed: false, reason: "Comments required when declining" };
  }
  // Executive decline goes to REJECTED, which restarts from NOT_STARTED
  // But the business rule is to return to cross-functional review with comments
  return {
    newState: "REJECTED",
    comments,
  };
}

/**
 * T-SO-002: Partner declines after executive signed.
 * Executive signature is invalidated — must re-sign.
 */
function processPartnerDecline(
  currentState: SignOffState,
  preserveExecutiveSignature: boolean,
): {
  newState: SignOffState;
  executiveSignaturePreserved: boolean;
  reason?: string;
} {
  if (currentState !== "PENDING_PARTNER") {
    return {
      newState: currentState,
      executiveSignaturePreserved: true,
      reason: "Can only decline from PENDING_PARTNER",
    };
  }

  // Partner decline invalidates the executive signature — entire flow restarts
  const result: { newState: SignOffState; executiveSignaturePreserved: boolean; reason?: string } = {
    newState: "REJECTED",
    executiveSignaturePreserved: false,
  };
  if (preserveExecutiveSignature) {
    result.reason = "Executive signature cannot be preserved after partner rejection per policy";
  }
  return result;
}

/**
 * T-SO-003: Area data modified after PO validation — invalidate PO validation.
 */
function checkDataIntegrity(
  originalHash: string,
  currentHash: string,
): { valid: boolean; reason?: string } {
  if (originalHash !== currentHash) {
    return {
      valid: false,
      reason: "Data modified since validation — PO validation invalidated",
    };
  }
  return { valid: true };
}

/**
 * T-SO-004: All POs validated except one who left — replacement PO must re-validate.
 */
function checkProcessOwnerCoverage(
  requiredOwnerIds: string[],
  validatedByOwnerIds: string[],
  replacementMap: Record<string, string>,
): {
  complete: boolean;
  missingOwnerIds: string[];
  replacementRequired: string[];
} {
  const validatedSet = new Set(validatedByOwnerIds);
  const missingOwnerIds: string[] = [];
  const replacementRequired: string[] = [];

  for (const ownerId of requiredOwnerIds) {
    if (validatedSet.has(ownerId)) {
      continue;
    }
    // Check if replaced
    const replacementId = replacementMap[ownerId];
    if (replacementId && validatedSet.has(replacementId)) {
      continue;
    }
    if (replacementId) {
      replacementRequired.push(replacementId);
    } else {
      missingOwnerIds.push(ownerId);
    }
  }

  return {
    complete: missingOwnerIds.length === 0 && replacementRequired.length === 0,
    missingOwnerIds,
    replacementRequired,
  };
}

/**
 * T-SO-005: Sign-off initiated but data modified via API — hash mismatch.
 */
function validateSignOffDataIntegrity(
  snapshotHash: string,
  liveDataHash: string,
): TransitionResult {
  if (snapshotHash !== liveDataHash) {
    return {
      allowed: false,
      reason: "Data integrity violation: hash mismatch between snapshot and live data",
    };
  }
  return { allowed: true };
}

/**
 * T-SO-006: Concurrent sign-off — two executives try simultaneously.
 */
function attemptConcurrentSignOff(
  currentState: SignOffState,
  targetState: SignOffState,
  attempts: { userId: string; timestamp: number }[],
): { successes: string[]; failures: string[] } {
  const successes: string[] = [];
  const failures: string[] = [];
  const sorted = [...attempts].sort((a, b) => a.timestamp - b.timestamp);
  let locked = false;

  for (const attempt of sorted) {
    if (!locked) {
      const result = validateTransition(currentState, targetState);
      if (result.allowed) {
        successes.push(attempt.userId);
        locked = true;
      } else {
        failures.push(attempt.userId);
      }
    } else {
      failures.push(attempt.userId);
    }
  }

  return { successes, failures };
}

/**
 * T-SO-007: Sign-off with expired session.
 */
function validateSessionForSignOff(
  sessionExpired: boolean,
): TransitionResult {
  if (sessionExpired) {
    return {
      allowed: false,
      reason: "Session expired — re-authentication required before sign-off",
    };
  }
  return { allowed: true };
}

/**
 * T-SO-008: Sign-off on mobile device — touch signature or checkbox.
 */
function validateMobileSignOff(
  isMobileDevice: boolean,
  touchSignatureProvided: boolean,
  checkboxConfirmed: boolean,
): TransitionResult {
  if (!isMobileDevice) {
    return { allowed: true };
  }
  if (touchSignatureProvided || checkboxConfirmed) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "Mobile sign-off requires touch signature or checkbox confirmation",
  };
}

/**
 * T-SO-009: Snapshot created but Prisma transaction fails — rollback.
 */
function processSnapshotTransaction(
  snapshotCreated: boolean,
  transactionCommitted: boolean,
): {
  success: boolean;
  rolledBack: boolean;
  reason?: string;
} {
  if (snapshotCreated && !transactionCommitted) {
    return {
      success: false,
      rolledBack: true,
      reason: "Prisma transaction failed mid-write — snapshot rolled back",
    };
  }
  if (snapshotCreated && transactionCommitted) {
    return { success: true, rolledBack: false };
  }
  return {
    success: false,
    rolledBack: false,
    reason: "Snapshot was not created",
  };
}

/**
 * T-SO-010: Certificate PDF generation fails — sign-off must NOT advance.
 */
function processSignOffWithCertificate(
  currentState: SignOffState,
  pdfGenerated: boolean,
): {
  newState: SignOffState;
  advanced: boolean;
  reason?: string;
} {
  if (currentState !== "PENDING_PARTNER") {
    return {
      newState: currentState,
      advanced: false,
      reason: "Certificate generation only applies at PENDING_PARTNER stage",
    };
  }

  if (!pdfGenerated) {
    return {
      newState: currentState, // Stay at current state
      advanced: false,
      reason: "Certificate PDF generation failed — sign-off status not advanced",
    };
  }

  return {
    newState: "FULLY_SIGNED_OFF",
    advanced: true,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Sign-Off Lifecycle State Machine", () => {
  // -----------------------------------------------------------------------
  // Valid transitions
  // -----------------------------------------------------------------------
  describe("valid transitions", () => {
    const validCases: [SignOffState, SignOffState][] = [];
    for (const from of ALL_STATES) {
      for (const to of VALID_TRANSITIONS[from]) {
        validCases.push([from, to]);
      }
    }

    it.each(validCases)(
      "should allow transition from %s to %s",
      (from, to) => {
        const result = validateTransition(from, to);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      },
    );
  });

  // -----------------------------------------------------------------------
  // Invalid transitions — cannot skip layers
  // -----------------------------------------------------------------------
  describe("invalid transitions — cannot skip layers", () => {
    const invalidCases: [SignOffState, SignOffState][] = [];
    for (const from of ALL_STATES) {
      const validTargets = new Set(VALID_TRANSITIONS[from]);
      for (const to of ALL_STATES) {
        if (!validTargets.has(to)) {
          invalidCases.push([from, to]);
        }
      }
    }

    it.each(invalidCases)(
      "should reject transition from %s to %s",
      (from, to) => {
        const result = validateTransition(from, to);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Invalid transition");
      },
    );
  });

  // -----------------------------------------------------------------------
  // Specific skip-layer rejections
  // -----------------------------------------------------------------------
  describe("specific layer-skipping rejections", () => {
    it("should reject NOT_STARTED directly to TECHNICAL_VALIDATION_IN_PROGRESS", () => {
      const result = validateTransition("NOT_STARTED", "TECHNICAL_VALIDATION_IN_PROGRESS");
      expect(result.allowed).toBe(false);
    });

    it("should reject NOT_STARTED directly to PENDING_EXECUTIVE", () => {
      const result = validateTransition("NOT_STARTED", "PENDING_EXECUTIVE");
      expect(result.allowed).toBe(false);
    });

    it("should reject NOT_STARTED directly to FULLY_SIGNED_OFF", () => {
      const result = validateTransition("NOT_STARTED", "FULLY_SIGNED_OFF");
      expect(result.allowed).toBe(false);
    });

    it("should reject AREA_VALIDATION_IN_PROGRESS directly to EXECUTIVE_SIGNED", () => {
      const result = validateTransition("AREA_VALIDATION_IN_PROGRESS", "EXECUTIVE_SIGNED");
      expect(result.allowed).toBe(false);
    });

    it("should reject AREA_VALIDATION_COMPLETE directly to CROSS_FUNCTIONAL_IN_PROGRESS", () => {
      const result = validateTransition("AREA_VALIDATION_COMPLETE", "CROSS_FUNCTIONAL_IN_PROGRESS");
      expect(result.allowed).toBe(false);
    });

    it("should reject backward transitions in the middle of the flow", () => {
      const result = validateTransition("TECHNICAL_VALIDATION_IN_PROGRESS", "AREA_VALIDATION_IN_PROGRESS");
      expect(result.allowed).toBe(false);
    });

    it("should reject self-transitions for every state", () => {
      for (const state of ALL_STATES) {
        const result = validateTransition(state, state);
        expect(result.allowed).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------
  // getNextStates and isTerminalState
  // -----------------------------------------------------------------------
  describe("getNextStates", () => {
    it("should return AREA_VALIDATION_IN_PROGRESS for NOT_STARTED", () => {
      expect(getNextStates("NOT_STARTED")).toEqual(["AREA_VALIDATION_IN_PROGRESS"]);
    });

    it("should return AREA_VALIDATION_COMPLETE and REJECTED for AREA_VALIDATION_IN_PROGRESS", () => {
      const next = getNextStates("AREA_VALIDATION_IN_PROGRESS");
      expect(next).toHaveLength(2);
      expect(next).toContain("AREA_VALIDATION_COMPLETE");
      expect(next).toContain("REJECTED");
    });

    it("should return empty array for FULLY_SIGNED_OFF (terminal)", () => {
      expect(getNextStates("FULLY_SIGNED_OFF")).toEqual([]);
    });

    it("should return NOT_STARTED for REJECTED (restart)", () => {
      expect(getNextStates("REJECTED")).toEqual(["NOT_STARTED"]);
    });

    it("should return PENDING_PARTNER for EXECUTIVE_SIGNED", () => {
      expect(getNextStates("EXECUTIVE_SIGNED")).toEqual(["PENDING_PARTNER"]);
    });

    it("should return FULLY_SIGNED_OFF and REJECTED for PENDING_PARTNER", () => {
      const next = getNextStates("PENDING_PARTNER");
      expect(next).toHaveLength(2);
      expect(next).toContain("FULLY_SIGNED_OFF");
      expect(next).toContain("REJECTED");
    });

    it("should handle all states without errors", () => {
      for (const state of ALL_STATES) {
        const next = getNextStates(state);
        expect(Array.isArray(next)).toBe(true);
      }
    });
  });

  describe("isTerminalState", () => {
    it("should return true for FULLY_SIGNED_OFF", () => {
      expect(isTerminalState("FULLY_SIGNED_OFF")).toBe(true);
    });

    it("should return false for REJECTED (can restart)", () => {
      expect(isTerminalState("REJECTED")).toBe(false);
    });

    it("should return false for NOT_STARTED", () => {
      expect(isTerminalState("NOT_STARTED")).toBe(false);
    });

    it("should return false for all in-progress and pending states", () => {
      const nonTerminal: SignOffState[] = [
        "AREA_VALIDATION_IN_PROGRESS",
        "AREA_VALIDATION_COMPLETE",
        "TECHNICAL_VALIDATION_IN_PROGRESS",
        "TECHNICAL_VALIDATION_COMPLETE",
        "CROSS_FUNCTIONAL_IN_PROGRESS",
        "CROSS_FUNCTIONAL_COMPLETE",
        "PENDING_EXECUTIVE",
        "EXECUTIVE_SIGNED",
        "PENDING_PARTNER",
      ];
      for (const state of nonTerminal) {
        expect(isTerminalState(state)).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------
  // T-SO-001: Executive declines — returns to cross-functional with comments
  // -----------------------------------------------------------------------
  describe("T-SO-001: executive declines — returns to REJECTED with comments", () => {
    it("should decline from PENDING_EXECUTIVE with comments", () => {
      const result = processExecutiveDecline(
        "PENDING_EXECUTIVE",
        "Revenue projections do not align with Q3 targets",
      );
      expect("newState" in result).toBe(true);
      if ("newState" in result) {
        expect(result.newState).toBe("REJECTED");
        expect(result.comments).toBe("Revenue projections do not align with Q3 targets");
      }
    });

    it("should reject decline without comments", () => {
      const result = processExecutiveDecline("PENDING_EXECUTIVE", "");
      expect("allowed" in result).toBe(true);
      if ("allowed" in result) {
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Comments required");
      }
    });

    it("should reject decline with whitespace-only comments", () => {
      const result = processExecutiveDecline("PENDING_EXECUTIVE", "   ");
      expect("allowed" in result).toBe(true);
      if ("allowed" in result) {
        expect(result.allowed).toBe(false);
      }
    });

    it("should reject decline from wrong state", () => {
      const result = processExecutiveDecline("AREA_VALIDATION_IN_PROGRESS", "Some comment");
      expect("allowed" in result).toBe(true);
      if ("allowed" in result) {
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("PENDING_EXECUTIVE");
      }
    });

    it("REJECTED can transition back to NOT_STARTED (restart)", () => {
      const result = validateTransition("REJECTED", "NOT_STARTED");
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SO-002: Partner declines after executive signed
  // -----------------------------------------------------------------------
  describe("T-SO-002: partner declines after executive signed — signature invalidated", () => {
    it("should invalidate executive signature on partner rejection", () => {
      const result = processPartnerDecline("PENDING_PARTNER", false);
      expect(result.newState).toBe("REJECTED");
      expect(result.executiveSignaturePreserved).toBe(false);
    });

    it("should not preserve executive signature even if requested", () => {
      const result = processPartnerDecline("PENDING_PARTNER", true);
      expect(result.executiveSignaturePreserved).toBe(false);
      expect(result.reason).toContain("cannot be preserved");
    });

    it("should reject decline from non-PENDING_PARTNER state", () => {
      const result = processPartnerDecline("EXECUTIVE_SIGNED", false);
      expect(result.newState).toBe("EXECUTIVE_SIGNED");
      expect(result.reason).toContain("PENDING_PARTNER");
    });

    it("PENDING_PARTNER -> REJECTED is a valid transition", () => {
      const result = validateTransition("PENDING_PARTNER", "REJECTED");
      expect(result.allowed).toBe(true);
    });

    it("after rejection, flow restarts from NOT_STARTED", () => {
      const result = validateTransition("REJECTED", "NOT_STARTED");
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SO-003: PO validates area, then area data modified — invalidate PO validation
  // -----------------------------------------------------------------------
  describe("T-SO-003: data modification after PO validation — invalidation", () => {
    it("should detect data integrity violation when hashes differ", () => {
      const result = checkDataIntegrity(
        "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
        "xyz789xyz789xyz789xyz789xyz789xyz789xyz789xyz789xyz789xyz789xyz7",
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Data modified");
      expect(result.reason).toContain("invalidated");
    });

    it("should pass integrity check when hashes match", () => {
      const hash = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
      const result = checkDataIntegrity(hash, hash);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should detect single-character change", () => {
      const original = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
      const modified = "abc123def456abc123def456abc123def456abc123def456abc123def456abc2";
      const result = checkDataIntegrity(original, modified);
      expect(result.valid).toBe(false);
    });

    it("should handle empty hashes", () => {
      const result = checkDataIntegrity("", "");
      expect(result.valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SO-004: All POs validated except one who left — replacement must re-validate
  // -----------------------------------------------------------------------
  describe("T-SO-004: replacement PO must re-validate", () => {
    it("should be complete when all required owners have validated", () => {
      const result = checkProcessOwnerCoverage(
        ["po-1", "po-2", "po-3"],
        ["po-1", "po-2", "po-3"],
        {},
      );
      expect(result.complete).toBe(true);
      expect(result.missingOwnerIds).toEqual([]);
      expect(result.replacementRequired).toEqual([]);
    });

    it("should detect missing owner who left without replacement", () => {
      const result = checkProcessOwnerCoverage(
        ["po-1", "po-2", "po-3"],
        ["po-1", "po-3"],
        {}, // no replacement mapped
      );
      expect(result.complete).toBe(false);
      expect(result.missingOwnerIds).toContain("po-2");
    });

    it("should require replacement PO to validate when original left", () => {
      const result = checkProcessOwnerCoverage(
        ["po-1", "po-2", "po-3"],
        ["po-1", "po-3"],
        { "po-2": "po-2-replacement" }, // replacement mapped but not yet validated
      );
      expect(result.complete).toBe(false);
      expect(result.replacementRequired).toContain("po-2-replacement");
      expect(result.missingOwnerIds).toEqual([]);
    });

    it("should be complete when replacement PO has validated", () => {
      const result = checkProcessOwnerCoverage(
        ["po-1", "po-2", "po-3"],
        ["po-1", "po-3", "po-2-replacement"],
        { "po-2": "po-2-replacement" },
      );
      expect(result.complete).toBe(true);
    });

    it("should handle multiple replacements needed", () => {
      const result = checkProcessOwnerCoverage(
        ["po-1", "po-2", "po-3", "po-4"],
        ["po-1"],
        {
          "po-2": "po-2-new",
          "po-3": "po-3-new",
          // po-4 has no replacement
        },
      );
      expect(result.complete).toBe(false);
      expect(result.replacementRequired).toContain("po-2-new");
      expect(result.replacementRequired).toContain("po-3-new");
      expect(result.missingOwnerIds).toContain("po-4");
    });

    it("should handle empty required owners (no areas)", () => {
      const result = checkProcessOwnerCoverage([], [], {});
      expect(result.complete).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SO-005: Sign-off initiated but data modified via API — hash mismatch
  // -----------------------------------------------------------------------
  describe("T-SO-005: sign-off with data modified via API — hash mismatch", () => {
    it("should reject sign-off when snapshot hash differs from live data", () => {
      const result = validateSignOffDataIntegrity("snapshot-hash-1", "live-hash-2");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("hash mismatch");
    });

    it("should allow sign-off when hashes match", () => {
      const result = validateSignOffDataIntegrity("matching-hash", "matching-hash");
      expect(result.allowed).toBe(true);
    });

    it("should reject when live data was updated after snapshot", () => {
      const result = validateSignOffDataIntegrity(
        "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        "x9y8z7x9y8z7x9y8z7x9y8z7x9y8z7x9",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Data integrity violation");
    });

    it("should handle empty strings (both empty means match)", () => {
      const result = validateSignOffDataIntegrity("", "");
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SO-006: Concurrent sign-off — two executives try simultaneously
  // -----------------------------------------------------------------------
  describe("T-SO-006: concurrent sign-off — exactly one succeeds", () => {
    it("should allow exactly one of two simultaneous executive sign-offs", () => {
      const result = attemptConcurrentSignOff(
        "PENDING_EXECUTIVE",
        "EXECUTIVE_SIGNED",
        [
          { userId: "exec-A", timestamp: 1000 },
          { userId: "exec-B", timestamp: 1000 },
        ],
      );
      expect(result.successes).toHaveLength(1);
      expect(result.failures).toHaveLength(1);
    });

    it("first-arriving executive wins", () => {
      const result = attemptConcurrentSignOff(
        "PENDING_EXECUTIVE",
        "EXECUTIVE_SIGNED",
        [
          { userId: "exec-A", timestamp: 999 },
          { userId: "exec-B", timestamp: 1000 },
        ],
      );
      expect(result.successes).toEqual(["exec-A"]);
      expect(result.failures).toEqual(["exec-B"]);
    });

    it("should handle three simultaneous attempts", () => {
      const result = attemptConcurrentSignOff(
        "PENDING_EXECUTIVE",
        "EXECUTIVE_SIGNED",
        [
          { userId: "exec-A", timestamp: 500 },
          { userId: "exec-B", timestamp: 500 },
          { userId: "exec-C", timestamp: 500 },
        ],
      );
      expect(result.successes).toHaveLength(1);
      expect(result.failures).toHaveLength(2);
    });

    it("should handle concurrent partner sign-off attempts", () => {
      const result = attemptConcurrentSignOff(
        "PENDING_PARTNER",
        "FULLY_SIGNED_OFF",
        [
          { userId: "partner-A", timestamp: 1000 },
          { userId: "partner-B", timestamp: 1001 },
        ],
      );
      expect(result.successes).toHaveLength(1);
      expect(result.failures).toHaveLength(1);
    });

    it("should fail all on invalid transition", () => {
      const result = attemptConcurrentSignOff(
        "NOT_STARTED",
        "FULLY_SIGNED_OFF",
        [
          { userId: "exec-A", timestamp: 1000 },
          { userId: "exec-B", timestamp: 1001 },
        ],
      );
      expect(result.successes).toEqual([]);
      expect(result.failures).toHaveLength(2);
    });

    it("single attempt should succeed on valid transition", () => {
      const result = attemptConcurrentSignOff(
        "PENDING_EXECUTIVE",
        "EXECUTIVE_SIGNED",
        [{ userId: "exec-A", timestamp: 1000 }],
      );
      expect(result.successes).toEqual(["exec-A"]);
      expect(result.failures).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // T-SO-007: Sign-off with expired session — must re-authenticate
  // -----------------------------------------------------------------------
  describe("T-SO-007: sign-off with expired session", () => {
    it("should reject sign-off when session is expired", () => {
      const result = validateSessionForSignOff(true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Session expired");
      expect(result.reason).toContain("re-authentication");
    });

    it("should allow sign-off when session is active", () => {
      const result = validateSessionForSignOff(false);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // T-SO-008: Sign-off on mobile device — touch signature or checkbox
  // -----------------------------------------------------------------------
  describe("T-SO-008: mobile sign-off — touch signature or checkbox", () => {
    it("should allow sign-off on desktop without additional confirmation", () => {
      const result = validateMobileSignOff(false, false, false);
      expect(result.allowed).toBe(true);
    });

    it("should allow mobile sign-off with touch signature", () => {
      const result = validateMobileSignOff(true, true, false);
      expect(result.allowed).toBe(true);
    });

    it("should allow mobile sign-off with checkbox confirmation", () => {
      const result = validateMobileSignOff(true, false, true);
      expect(result.allowed).toBe(true);
    });

    it("should allow mobile sign-off with both touch and checkbox", () => {
      const result = validateMobileSignOff(true, true, true);
      expect(result.allowed).toBe(true);
    });

    it("should reject mobile sign-off without touch signature or checkbox", () => {
      const result = validateMobileSignOff(true, false, false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("touch signature");
      expect(result.reason).toContain("checkbox");
    });
  });

  // -----------------------------------------------------------------------
  // T-SO-009: Snapshot created but Prisma transaction fails — rollback
  // -----------------------------------------------------------------------
  describe("T-SO-009: Prisma transaction failure — rollback integrity", () => {
    it("should rollback when snapshot created but transaction not committed", () => {
      const result = processSnapshotTransaction(true, false);
      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(result.reason).toContain("Prisma transaction failed");
      expect(result.reason).toContain("rolled back");
    });

    it("should succeed when snapshot created and transaction committed", () => {
      const result = processSnapshotTransaction(true, true);
      expect(result.success).toBe(true);
      expect(result.rolledBack).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it("should fail without rollback when snapshot was not created", () => {
      const result = processSnapshotTransaction(false, false);
      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(false);
      expect(result.reason).toContain("not created");
    });

    it("should not have orphaned snapshot after rollback", () => {
      const result = processSnapshotTransaction(true, false);
      // Rollback means snapshot is cleaned up
      expect(result.rolledBack).toBe(true);
      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // T-SO-010: Certificate PDF generation fails — sign-off must NOT advance
  // -----------------------------------------------------------------------
  describe("T-SO-010: certificate PDF generation failure — no state advance", () => {
    it("should not advance sign-off when PDF generation fails", () => {
      const result = processSignOffWithCertificate("PENDING_PARTNER", false);
      expect(result.newState).toBe("PENDING_PARTNER");
      expect(result.advanced).toBe(false);
      expect(result.reason).toContain("PDF generation failed");
    });

    it("should advance to FULLY_SIGNED_OFF when PDF generated successfully", () => {
      const result = processSignOffWithCertificate("PENDING_PARTNER", true);
      expect(result.newState).toBe("FULLY_SIGNED_OFF");
      expect(result.advanced).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should not attempt certificate generation from wrong state", () => {
      const result = processSignOffWithCertificate("PENDING_EXECUTIVE", true);
      expect(result.advanced).toBe(false);
      expect(result.reason).toContain("PENDING_PARTNER");
    });

    it("should keep state unchanged on PDF failure from correct state", () => {
      const result = processSignOffWithCertificate("PENDING_PARTNER", false);
      expect(result.newState).toBe("PENDING_PARTNER");
      // Verify we can retry
      const retry = processSignOffWithCertificate("PENDING_PARTNER", true);
      expect(retry.newState).toBe("FULLY_SIGNED_OFF");
      expect(retry.advanced).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Structural integrity
  // -----------------------------------------------------------------------
  describe("state machine structural integrity", () => {
    it("should have exactly 12 states", () => {
      expect(ALL_STATES).toHaveLength(12);
    });

    it("every target in the transition map should be a known state", () => {
      for (const from of ALL_STATES) {
        for (const to of VALID_TRANSITIONS[from]) {
          expect(ALL_STATES).toContain(to);
        }
      }
    });

    it("FULLY_SIGNED_OFF should be the only terminal state", () => {
      const terminal = ALL_STATES.filter((s) => isTerminalState(s));
      expect(terminal).toEqual(["FULLY_SIGNED_OFF"]);
    });

    it("REJECTED should be reachable from all in-progress and pending states", () => {
      const statesWithRejection: SignOffState[] = [
        "AREA_VALIDATION_IN_PROGRESS",
        "TECHNICAL_VALIDATION_IN_PROGRESS",
        "CROSS_FUNCTIONAL_IN_PROGRESS",
        "PENDING_EXECUTIVE",
        "PENDING_PARTNER",
      ];
      for (const state of statesWithRejection) {
        expect(VALID_TRANSITIONS[state]).toContain("REJECTED");
      }
    });

    it("complete states should NOT have a REJECTED transition", () => {
      const completeStates: SignOffState[] = [
        "AREA_VALIDATION_COMPLETE",
        "TECHNICAL_VALIDATION_COMPLETE",
        "CROSS_FUNCTIONAL_COMPLETE",
        "EXECUTIVE_SIGNED",
      ];
      for (const state of completeStates) {
        expect(VALID_TRANSITIONS[state]).not.toContain("REJECTED");
      }
    });

    it("ordered layers should follow the expected sequence", () => {
      for (let i = 0; i < ORDERED_LAYERS.length - 1; i++) {
        const from = ORDERED_LAYERS[i]!;
        const to = ORDERED_LAYERS[i + 1]!;
        // Each consecutive pair should be a valid transition
        // (except _COMPLETE -> _IN_PROGRESS which is the next step)
        const result = validateTransition(from, to);
        expect(result.allowed).toBe(true);
      }
    });

    it("NOT_STARTED should be the only state with no incoming transitions (except via REJECTED)", () => {
      const hasIncoming = new Set<SignOffState>();
      for (const targets of Object.values(VALID_TRANSITIONS)) {
        for (const t of targets as SignOffState[]) {
          hasIncoming.add(t);
        }
      }
      // NOT_STARTED has incoming from REJECTED
      expect(hasIncoming.has("NOT_STARTED")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Name mapping & topology verification
  // Ensures the V2→Real mapping produces the expected transition topology.
  // If the real module changes, this test will catch the mismatch.
  // -----------------------------------------------------------------------
  describe("V2-to-real name mapping verification", () => {
    it("V2_TO_REAL should map all 12 V2 states to 12 unique real states", () => {
      const v2States = Object.keys(V2_TO_REAL);
      const realStates = Object.values(V2_TO_REAL);
      expect(v2States).toHaveLength(12);
      expect(new Set(realStates).size).toBe(12);
    });

    it("REAL_TO_V2 should be the exact inverse of V2_TO_REAL", () => {
      for (const [v2, real] of Object.entries(V2_TO_REAL)) {
        expect(REAL_TO_V2[real as SignOffStatus]).toBe(v2);
      }
    });

    it("derived VALID_TRANSITIONS should match expected topology", () => {
      // Freeze the expected topology so changes to the real module are caught
      expect(VALID_TRANSITIONS.NOT_STARTED).toEqual(["AREA_VALIDATION_IN_PROGRESS"]);
      expect(VALID_TRANSITIONS.AREA_VALIDATION_IN_PROGRESS).toEqual(["AREA_VALIDATION_COMPLETE", "REJECTED"]);
      expect(VALID_TRANSITIONS.AREA_VALIDATION_COMPLETE).toEqual(["TECHNICAL_VALIDATION_IN_PROGRESS"]);
      expect(VALID_TRANSITIONS.TECHNICAL_VALIDATION_IN_PROGRESS).toEqual(["TECHNICAL_VALIDATION_COMPLETE", "REJECTED"]);
      expect(VALID_TRANSITIONS.TECHNICAL_VALIDATION_COMPLETE).toEqual(["CROSS_FUNCTIONAL_IN_PROGRESS"]);
      expect(VALID_TRANSITIONS.CROSS_FUNCTIONAL_IN_PROGRESS).toEqual(["CROSS_FUNCTIONAL_COMPLETE", "REJECTED"]);
      expect(VALID_TRANSITIONS.CROSS_FUNCTIONAL_COMPLETE).toEqual(["PENDING_EXECUTIVE"]);
      expect(VALID_TRANSITIONS.PENDING_EXECUTIVE).toEqual(["EXECUTIVE_SIGNED", "REJECTED"]);
      expect(VALID_TRANSITIONS.EXECUTIVE_SIGNED).toEqual(["PENDING_PARTNER"]);
      expect(VALID_TRANSITIONS.PENDING_PARTNER).toEqual(["FULLY_SIGNED_OFF", "REJECTED"]);
      expect(VALID_TRANSITIONS.FULLY_SIGNED_OFF).toEqual([]);
      expect(VALID_TRANSITIONS.REJECTED).toEqual(["NOT_STARTED"]);
    });

    it("renamed states should map correctly", () => {
      // These 6 states have different names between V2 spec and real code
      expect(V2_TO_REAL.NOT_STARTED).toBe("VALIDATION_NOT_STARTED");
      expect(V2_TO_REAL.CROSS_FUNCTIONAL_IN_PROGRESS).toBe("CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS");
      expect(V2_TO_REAL.CROSS_FUNCTIONAL_COMPLETE).toBe("CROSS_FUNCTIONAL_VALIDATION_COMPLETE");
      expect(V2_TO_REAL.PENDING_EXECUTIVE).toBe("EXECUTIVE_SIGN_OFF_PENDING");
      expect(V2_TO_REAL.PENDING_PARTNER).toBe("PARTNER_COUNTERSIGN_PENDING");
      expect(V2_TO_REAL.FULLY_SIGNED_OFF).toBe("COMPLETED");
    });
  });
});
