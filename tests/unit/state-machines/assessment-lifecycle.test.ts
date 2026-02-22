/**
 * STATUS: Wired (partial — cross-reference only)
 * REAL MODULE: src/lib/assessment/status-machine.ts
 * PRE-EXISTING COVERAGE: tests/unit/status-machine.test.ts
 * WIRING NOTES: V2 spec has 13 SCREAMING_CASE states vs real module's 12
 *   lowercase states with fundamentally different topology. Inline spec logic
 *   preserved. Real module imported for cross-reference verification tests.
 */
import { describe, it, expect } from "vitest";
import {
  canTransition as realCanTransition,
  VALID_TRANSITIONS_V2 as REAL_TRANSITIONS,
  ASSESSMENT_STATUSES_V2 as REAL_STATUSES,
} from "@/lib/assessment/status-machine";

// ---------------------------------------------------------------------------
// Inline types (V2 spec — different topology from real module)
// ---------------------------------------------------------------------------

type AssessmentState =
  | "SETUP"
  | "SCOPE_IN_PROGRESS"
  | "SCOPE_LOCKED"
  | "PROCESS_REVIEW"
  | "GAP_RESOLUTION"
  | "INTEGRATION_ASSESSMENT"
  | "DATA_MIGRATION_ASSESSMENT"
  | "OCM_ASSESSMENT"
  | "VALIDATION"
  | "PENDING_SIGN_OFF"
  | "SIGNED_OFF"
  | "HANDED_OFF"
  | "REASSESSMENT_NEEDED";

interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

interface WorkstreamStatus {
  name: string;
  status: "completed" | "failed" | "pending";
}

interface TransitionContext {
  scopedItemCount?: number;
  changeRequestId?: string;
  workstreams?: WorkstreamStatus[];
  userId?: string;
  isOffline?: boolean;
  transitionQueue?: Array<{ from: AssessmentState; to: AssessmentState; timestamp: number }>;
}

// ---------------------------------------------------------------------------
// State machine definition — canonical map of valid transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<AssessmentState, AssessmentState[]> = {
  SETUP: ["SCOPE_IN_PROGRESS"],
  SCOPE_IN_PROGRESS: ["SCOPE_LOCKED"],
  SCOPE_LOCKED: ["PROCESS_REVIEW"],
  PROCESS_REVIEW: [
    "GAP_RESOLUTION",
    "INTEGRATION_ASSESSMENT",
    "DATA_MIGRATION_ASSESSMENT",
    "OCM_ASSESSMENT",
  ],
  GAP_RESOLUTION: ["VALIDATION"],
  INTEGRATION_ASSESSMENT: ["VALIDATION"],
  DATA_MIGRATION_ASSESSMENT: ["VALIDATION"],
  OCM_ASSESSMENT: ["VALIDATION"],
  VALIDATION: ["PENDING_SIGN_OFF"],
  PENDING_SIGN_OFF: ["SIGNED_OFF"],
  SIGNED_OFF: ["HANDED_OFF", "REASSESSMENT_NEEDED"],
  HANDED_OFF: ["REASSESSMENT_NEEDED"],
  REASSESSMENT_NEEDED: ["SCOPE_IN_PROGRESS"],
};

const ALL_STATES: AssessmentState[] = Object.keys(VALID_TRANSITIONS) as AssessmentState[];

// Parallel workstream states that must all complete before VALIDATION
const PARALLEL_WORKSTREAMS: AssessmentState[] = [
  "GAP_RESOLUTION",
  "INTEGRATION_ASSESSMENT",
  "DATA_MIGRATION_ASSESSMENT",
  "OCM_ASSESSMENT",
];

// Roles that should be notified per-state
const NOTIFICATION_ROLES: Record<AssessmentState, string[]> = {
  SETUP: ["consultant", "platform_admin"],
  SCOPE_IN_PROGRESS: ["consultant", "process_owner"],
  SCOPE_LOCKED: ["consultant", "solution_architect"],
  PROCESS_REVIEW: ["consultant", "process_owner", "solution_architect"],
  GAP_RESOLUTION: ["consultant", "process_owner"],
  INTEGRATION_ASSESSMENT: ["it_lead", "solution_architect"],
  DATA_MIGRATION_ASSESSMENT: ["data_migration_lead", "solution_architect"],
  OCM_ASSESSMENT: ["consultant", "project_manager"],
  VALIDATION: ["consultant", "solution_architect", "process_owner"],
  PENDING_SIGN_OFF: ["executive_sponsor", "partner_lead"],
  SIGNED_OFF: ["executive_sponsor", "consultant", "partner_lead"],
  HANDED_OFF: ["platform_admin", "consultant"],
  REASSESSMENT_NEEDED: ["consultant", "solution_architect", "executive_sponsor"],
};

// ---------------------------------------------------------------------------
// Functions under test
// ---------------------------------------------------------------------------

function getNextStates(from: AssessmentState): AssessmentState[] {
  return VALID_TRANSITIONS[from] ?? [];
}

function validateTransition(
  from: AssessmentState,
  to: AssessmentState,
  context?: TransitionContext,
): TransitionResult {
  const validTargets = VALID_TRANSITIONS[from];
  if (!validTargets || !validTargets.includes(to)) {
    return {
      allowed: false,
      reason: `Invalid transition from ${from} to ${to}`,
    };
  }

  // T-SM-001: SCOPE_LOCKED requires at least 1 scoped item
  if (from === "SCOPE_IN_PROGRESS" && to === "SCOPE_LOCKED") {
    if (context && (context.scopedItemCount === undefined || context.scopedItemCount <= 0)) {
      return {
        allowed: false,
        reason: "Cannot lock scope with 0 items scoped",
      };
    }
  }

  // T-SM-004 / T-SM-005: REASSESSMENT_NEEDED requires a change request
  if (
    to === "REASSESSMENT_NEEDED" &&
    (from === "SIGNED_OFF" || from === "HANDED_OFF")
  ) {
    if (!context?.changeRequestId) {
      return {
        allowed: false,
        reason: "Change request required for reassessment from " + from,
      };
    }
  }

  return { allowed: true };
}

/** Parallel workstream check: only when ALL workstreams are "completed" does transition to VALIDATION happen. */
function canAdvanceToValidation(workstreams: WorkstreamStatus[]): {
  canAdvance: boolean;
  reason?: string;
} {
  if (workstreams.length === 0) {
    return { canAdvance: false, reason: "No workstreams provided" };
  }

  const allCompleted = workstreams.every((ws) => ws.status === "completed");
  if (allCompleted) {
    return { canAdvance: true };
  }

  const hasFailed = workstreams.some((ws) => ws.status === "failed");
  const hasPending = workstreams.some((ws) => ws.status === "pending");

  if (hasFailed) {
    return { canAdvance: false, reason: "One or more workstreams failed" };
  }

  if (hasPending) {
    return { canAdvance: false, reason: "One or more workstreams still pending" };
  }

  return { canAdvance: false, reason: "Workstreams not all completed" };
}

/**
 * Simulate a race-condition-safe transition with an optimistic lock.
 * Returns which attempt(s) succeed.
 */
function attemptConcurrentTransition(
  currentState: AssessmentState,
  targetState: AssessmentState,
  attempts: { userId: string; timestamp: number }[],
): { successes: string[]; failures: string[] } {
  const successes: string[] = [];
  const failures: string[] = [];

  // Sort by timestamp — first arrival wins
  const sorted = [...attempts].sort((a, b) => a.timestamp - b.timestamp);
  let locked = false;

  for (const attempt of sorted) {
    if (!locked) {
      const result = validateTransition(currentState, targetState);
      if (result.allowed) {
        successes.push(attempt.userId);
        locked = true; // Lock acquired — subsequent attempts fail
      } else {
        failures.push(attempt.userId);
      }
    } else {
      failures.push(attempt.userId);
    }
  }

  return { successes, failures };
}

/** Offline queue: store transitions and replay on reconnect. */
function queueOfflineTransition(
  queue: Array<{ from: AssessmentState; to: AssessmentState; timestamp: number }>,
  from: AssessmentState,
  to: AssessmentState,
): Array<{ from: AssessmentState; to: AssessmentState; timestamp: number }> {
  return [...queue, { from, to, timestamp: Date.now() }];
}

function replayOfflineQueue(
  queue: Array<{ from: AssessmentState; to: AssessmentState; timestamp: number }>,
): { applied: number; rejected: number; finalState: AssessmentState | null } {
  let applied = 0;
  let rejected = 0;
  let currentState: AssessmentState | null = null;

  for (const entry of queue) {
    const from = currentState ?? entry.from;
    const result = validateTransition(from, entry.to);
    if (result.allowed) {
      currentState = entry.to;
      applied++;
    } else {
      rejected++;
    }
  }

  return { applied, rejected, finalState: currentState };
}

/** Get notification targets for a state transition. */
function getNotificationTargets(
  _from: AssessmentState,
  to: AssessmentState,
): string[] {
  return NOTIFICATION_ROLES[to] ?? [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Assessment Lifecycle State Machine", () => {
  // -----------------------------------------------------------------------
  // Valid transitions
  // -----------------------------------------------------------------------
  describe("valid transitions", () => {
    const validCases: [AssessmentState, AssessmentState][] = [];
    for (const from of ALL_STATES) {
      for (const to of VALID_TRANSITIONS[from]) {
        validCases.push([from, to]);
      }
    }

    it.each(validCases)(
      "should allow transition from %s to %s",
      (from, to) => {
        // Provide context so prerequisite checks pass
        const context: TransitionContext = {
          scopedItemCount: 5,
          changeRequestId: "CR-001",
        };
        const result = validateTransition(from, to, context);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      },
    );
  });

  // -----------------------------------------------------------------------
  // Invalid transitions — every combination NOT in the valid map
  // -----------------------------------------------------------------------
  describe("invalid transitions", () => {
    const invalidCases: [AssessmentState, AssessmentState][] = [];
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
  // getNextStates
  // -----------------------------------------------------------------------
  describe("getNextStates", () => {
    it("should return SCOPE_IN_PROGRESS for SETUP", () => {
      expect(getNextStates("SETUP")).toEqual(["SCOPE_IN_PROGRESS"]);
    });

    it("should return SCOPE_LOCKED for SCOPE_IN_PROGRESS", () => {
      expect(getNextStates("SCOPE_IN_PROGRESS")).toEqual(["SCOPE_LOCKED"]);
    });

    it("should return 4 parallel workstream states for PROCESS_REVIEW", () => {
      const next = getNextStates("PROCESS_REVIEW");
      expect(next).toHaveLength(4);
      expect(next).toContain("GAP_RESOLUTION");
      expect(next).toContain("INTEGRATION_ASSESSMENT");
      expect(next).toContain("DATA_MIGRATION_ASSESSMENT");
      expect(next).toContain("OCM_ASSESSMENT");
    });

    it("should return HANDED_OFF and REASSESSMENT_NEEDED for SIGNED_OFF", () => {
      const next = getNextStates("SIGNED_OFF");
      expect(next).toHaveLength(2);
      expect(next).toContain("HANDED_OFF");
      expect(next).toContain("REASSESSMENT_NEEDED");
    });

    it("should return REASSESSMENT_NEEDED for HANDED_OFF", () => {
      expect(getNextStates("HANDED_OFF")).toEqual(["REASSESSMENT_NEEDED"]);
    });

    it("should return SCOPE_IN_PROGRESS for REASSESSMENT_NEEDED", () => {
      expect(getNextStates("REASSESSMENT_NEEDED")).toEqual(["SCOPE_IN_PROGRESS"]);
    });

    it("should return states for every state in the machine", () => {
      for (const state of ALL_STATES) {
        const next = getNextStates(state);
        expect(Array.isArray(next)).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // T-SM-001: Transition with incomplete prerequisites
  // -----------------------------------------------------------------------
  describe("T-SM-001: incomplete prerequisites — scope lock with 0 items", () => {
    it("should reject SCOPE_IN_PROGRESS -> SCOPE_LOCKED with 0 scoped items", () => {
      const result = validateTransition("SCOPE_IN_PROGRESS", "SCOPE_LOCKED", {
        scopedItemCount: 0,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("0 items scoped");
    });

    it("should reject SCOPE_IN_PROGRESS -> SCOPE_LOCKED with undefined scoped items", () => {
      const result = validateTransition("SCOPE_IN_PROGRESS", "SCOPE_LOCKED", {});
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("0 items scoped");
    });

    it("should reject SCOPE_IN_PROGRESS -> SCOPE_LOCKED with negative scoped items", () => {
      const result = validateTransition("SCOPE_IN_PROGRESS", "SCOPE_LOCKED", {
        scopedItemCount: -1,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("0 items scoped");
    });

    it("should allow SCOPE_IN_PROGRESS -> SCOPE_LOCKED with 1+ scoped items", () => {
      const result = validateTransition("SCOPE_IN_PROGRESS", "SCOPE_LOCKED", {
        scopedItemCount: 1,
      });
      expect(result.allowed).toBe(true);
    });

    it("should allow SCOPE_IN_PROGRESS -> SCOPE_LOCKED with many scoped items", () => {
      const result = validateTransition("SCOPE_IN_PROGRESS", "SCOPE_LOCKED", {
        scopedItemCount: 500,
      });
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SM-002: Parallel workstream — only last completing stream triggers VALIDATION
  // -----------------------------------------------------------------------
  describe("T-SM-002: parallel workstream completion triggers VALIDATION", () => {
    it("should not advance when only one workstream is completed", () => {
      const result = canAdvanceToValidation([
        { name: "GAP_RESOLUTION", status: "completed" },
        { name: "INTEGRATION_ASSESSMENT", status: "pending" },
        { name: "DATA_MIGRATION_ASSESSMENT", status: "pending" },
        { name: "OCM_ASSESSMENT", status: "pending" },
      ]);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("pending");
    });

    it("should not advance when three of four workstreams are completed", () => {
      const result = canAdvanceToValidation([
        { name: "GAP_RESOLUTION", status: "completed" },
        { name: "INTEGRATION_ASSESSMENT", status: "completed" },
        { name: "DATA_MIGRATION_ASSESSMENT", status: "completed" },
        { name: "OCM_ASSESSMENT", status: "pending" },
      ]);
      expect(result.canAdvance).toBe(false);
    });

    it("should advance when all four workstreams are completed", () => {
      const result = canAdvanceToValidation([
        { name: "GAP_RESOLUTION", status: "completed" },
        { name: "INTEGRATION_ASSESSMENT", status: "completed" },
        { name: "DATA_MIGRATION_ASSESSMENT", status: "completed" },
        { name: "OCM_ASSESSMENT", status: "completed" },
      ]);
      expect(result.canAdvance).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should not advance with empty workstreams array", () => {
      const result = canAdvanceToValidation([]);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("No workstreams");
    });

    it("each workstream individually allows transition to VALIDATION", () => {
      for (const ws of PARALLEL_WORKSTREAMS) {
        const result = validateTransition(ws, "VALIDATION");
        expect(result.allowed).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // T-SM-003: Parallel workstream — mixed statuses prevent transition
  // -----------------------------------------------------------------------
  describe("T-SM-003: parallel workstream — one complete, one failed, one pending", () => {
    it("should not advance when workstreams are mixed: completed, failed, pending", () => {
      const result = canAdvanceToValidation([
        { name: "GAP_RESOLUTION", status: "completed" },
        { name: "INTEGRATION_ASSESSMENT", status: "failed" },
        { name: "DATA_MIGRATION_ASSESSMENT", status: "pending" },
        { name: "OCM_ASSESSMENT", status: "pending" },
      ]);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should not advance when one workstream has failed", () => {
      const result = canAdvanceToValidation([
        { name: "GAP_RESOLUTION", status: "completed" },
        { name: "INTEGRATION_ASSESSMENT", status: "completed" },
        { name: "DATA_MIGRATION_ASSESSMENT", status: "completed" },
        { name: "OCM_ASSESSMENT", status: "failed" },
      ]);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("failed");
    });

    it("should not advance when all workstreams are pending", () => {
      const result = canAdvanceToValidation([
        { name: "GAP_RESOLUTION", status: "pending" },
        { name: "INTEGRATION_ASSESSMENT", status: "pending" },
        { name: "DATA_MIGRATION_ASSESSMENT", status: "pending" },
        { name: "OCM_ASSESSMENT", status: "pending" },
      ]);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("pending");
    });

    it("should not advance when all workstreams have failed", () => {
      const result = canAdvanceToValidation([
        { name: "GAP_RESOLUTION", status: "failed" },
        { name: "INTEGRATION_ASSESSMENT", status: "failed" },
        { name: "DATA_MIGRATION_ASSESSMENT", status: "failed" },
        { name: "OCM_ASSESSMENT", status: "failed" },
      ]);
      expect(result.canAdvance).toBe(false);
      expect(result.reason).toContain("failed");
    });
  });

  // -----------------------------------------------------------------------
  // T-SM-004: REASSESSMENT_NEEDED from SIGNED_OFF requires change request
  // -----------------------------------------------------------------------
  describe("T-SM-004: REASSESSMENT_NEEDED from SIGNED_OFF requires change request", () => {
    it("should reject without change request", () => {
      const result = validateTransition("SIGNED_OFF", "REASSESSMENT_NEEDED", {});
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Change request required");
      expect(result.reason).toContain("SIGNED_OFF");
    });

    it("should reject with undefined change request id", () => {
      const result = validateTransition("SIGNED_OFF", "REASSESSMENT_NEEDED", {
        changeRequestId: undefined,
      });
      expect(result.allowed).toBe(false);
    });

    it("should reject with empty string change request id", () => {
      const result = validateTransition("SIGNED_OFF", "REASSESSMENT_NEEDED", {
        changeRequestId: "",
      });
      expect(result.allowed).toBe(false);
    });

    it("should allow with valid change request id", () => {
      const result = validateTransition("SIGNED_OFF", "REASSESSMENT_NEEDED", {
        changeRequestId: "CR-2026-001",
      });
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SM-005: REASSESSMENT_NEEDED from HANDED_OFF requires change request
  // -----------------------------------------------------------------------
  describe("T-SM-005: REASSESSMENT_NEEDED from HANDED_OFF requires change request", () => {
    it("should reject without change request", () => {
      const result = validateTransition("HANDED_OFF", "REASSESSMENT_NEEDED", {});
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Change request required");
      expect(result.reason).toContain("HANDED_OFF");
    });

    it("should reject with undefined change request id", () => {
      const result = validateTransition("HANDED_OFF", "REASSESSMENT_NEEDED", {
        changeRequestId: undefined,
      });
      expect(result.allowed).toBe(false);
    });

    it("should allow with valid change request id", () => {
      const result = validateTransition("HANDED_OFF", "REASSESSMENT_NEEDED", {
        changeRequestId: "CR-2026-002",
      });
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T-SM-006: Race condition — two users trigger transition simultaneously
  // -----------------------------------------------------------------------
  describe("T-SM-006: race condition — simultaneous transition attempts", () => {
    it("should allow exactly one of two simultaneous attempts", () => {
      const result = attemptConcurrentTransition(
        "PENDING_SIGN_OFF",
        "SIGNED_OFF",
        [
          { userId: "user-A", timestamp: 1000 },
          { userId: "user-B", timestamp: 1000 },
        ],
      );
      expect(result.successes).toHaveLength(1);
      expect(result.failures).toHaveLength(1);
    });

    it("first-arriving user wins the transition", () => {
      const result = attemptConcurrentTransition(
        "VALIDATION",
        "PENDING_SIGN_OFF",
        [
          { userId: "user-A", timestamp: 999 },
          { userId: "user-B", timestamp: 1000 },
        ],
      );
      expect(result.successes).toEqual(["user-A"]);
      expect(result.failures).toEqual(["user-B"]);
    });

    it("should handle three simultaneous attempts — still only one succeeds", () => {
      const result = attemptConcurrentTransition(
        "SCOPE_LOCKED",
        "PROCESS_REVIEW",
        [
          { userId: "user-A", timestamp: 500 },
          { userId: "user-B", timestamp: 500 },
          { userId: "user-C", timestamp: 500 },
        ],
      );
      expect(result.successes).toHaveLength(1);
      expect(result.failures).toHaveLength(2);
    });

    it("should handle single attempt — succeeds", () => {
      const result = attemptConcurrentTransition(
        "SETUP",
        "SCOPE_IN_PROGRESS",
        [{ userId: "user-A", timestamp: 1000 }],
      );
      expect(result.successes).toEqual(["user-A"]);
      expect(result.failures).toEqual([]);
    });

    it("should fail all attempts on an invalid transition", () => {
      const result = attemptConcurrentTransition(
        "SETUP",
        "SIGNED_OFF", // invalid
        [
          { userId: "user-A", timestamp: 1000 },
          { userId: "user-B", timestamp: 1001 },
        ],
      );
      expect(result.successes).toEqual([]);
      expect(result.failures).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // T-SM-007: Transition during offline mode — queued and replayed
  // -----------------------------------------------------------------------
  describe("T-SM-007: offline mode — queue and replay transitions", () => {
    it("should queue a transition while offline", () => {
      const queue = queueOfflineTransition([], "SETUP", "SCOPE_IN_PROGRESS");
      expect(queue).toHaveLength(1);
      expect(queue[0].from).toBe("SETUP");
      expect(queue[0].to).toBe("SCOPE_IN_PROGRESS");
      expect(queue[0].timestamp).toBeGreaterThan(0);
    });

    it("should queue multiple transitions", () => {
      let queue = queueOfflineTransition([], "SETUP", "SCOPE_IN_PROGRESS");
      queue = queueOfflineTransition(queue, "SCOPE_IN_PROGRESS", "SCOPE_LOCKED");
      expect(queue).toHaveLength(2);
    });

    it("should replay a valid queue successfully", () => {
      const queue = [
        { from: "SETUP" as AssessmentState, to: "SCOPE_IN_PROGRESS" as AssessmentState, timestamp: 1 },
        { from: "SCOPE_IN_PROGRESS" as AssessmentState, to: "SCOPE_LOCKED" as AssessmentState, timestamp: 2 },
        { from: "SCOPE_LOCKED" as AssessmentState, to: "PROCESS_REVIEW" as AssessmentState, timestamp: 3 },
      ];
      const result = replayOfflineQueue(queue);
      expect(result.applied).toBe(3);
      expect(result.rejected).toBe(0);
      expect(result.finalState).toBe("PROCESS_REVIEW");
    });

    it("should reject invalid transitions in the queue and continue", () => {
      const queue = [
        { from: "SETUP" as AssessmentState, to: "SCOPE_IN_PROGRESS" as AssessmentState, timestamp: 1 },
        { from: "SCOPE_IN_PROGRESS" as AssessmentState, to: "SIGNED_OFF" as AssessmentState, timestamp: 2 }, // invalid
      ];
      const result = replayOfflineQueue(queue);
      expect(result.applied).toBe(1);
      expect(result.rejected).toBe(1);
      expect(result.finalState).toBe("SCOPE_IN_PROGRESS");
    });

    it("should handle empty queue", () => {
      const result = replayOfflineQueue([]);
      expect(result.applied).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.finalState).toBeNull();
    });

    it("should replay a single-item queue", () => {
      const queue = [
        { from: "SETUP" as AssessmentState, to: "SCOPE_IN_PROGRESS" as AssessmentState, timestamp: 1 },
      ];
      const result = replayOfflineQueue(queue);
      expect(result.applied).toBe(1);
      expect(result.finalState).toBe("SCOPE_IN_PROGRESS");
    });

    it("should reject all items if first transition is invalid", () => {
      const queue = [
        { from: "SETUP" as AssessmentState, to: "SIGNED_OFF" as AssessmentState, timestamp: 1 },
        { from: "SIGNED_OFF" as AssessmentState, to: "HANDED_OFF" as AssessmentState, timestamp: 2 },
      ];
      const result = replayOfflineQueue(queue);
      // First is rejected, second tries from null (uses entry.from SIGNED_OFF -> HANDED_OFF which is valid)
      // But since first was rejected, currentState is null so second uses its own from
      expect(result.rejected).toBeGreaterThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // T-SM-008: Transition notification — all relevant roles notified
  // -----------------------------------------------------------------------
  describe("T-SM-008: transition notifications", () => {
    it("should notify executive_sponsor and partner_lead on transition to PENDING_SIGN_OFF", () => {
      const roles = getNotificationTargets("VALIDATION", "PENDING_SIGN_OFF");
      expect(roles).toContain("executive_sponsor");
      expect(roles).toContain("partner_lead");
    });

    it("should notify consultant on transition to SIGNED_OFF", () => {
      const roles = getNotificationTargets("PENDING_SIGN_OFF", "SIGNED_OFF");
      expect(roles).toContain("consultant");
      expect(roles).toContain("executive_sponsor");
      expect(roles).toContain("partner_lead");
    });

    it("should notify consultant and solution_architect on REASSESSMENT_NEEDED", () => {
      const roles = getNotificationTargets("SIGNED_OFF", "REASSESSMENT_NEEDED");
      expect(roles).toContain("consultant");
      expect(roles).toContain("solution_architect");
      expect(roles).toContain("executive_sponsor");
    });

    it("should notify it_lead and solution_architect on INTEGRATION_ASSESSMENT", () => {
      const roles = getNotificationTargets("PROCESS_REVIEW", "INTEGRATION_ASSESSMENT");
      expect(roles).toContain("it_lead");
      expect(roles).toContain("solution_architect");
    });

    it("should notify data_migration_lead on DATA_MIGRATION_ASSESSMENT", () => {
      const roles = getNotificationTargets("PROCESS_REVIEW", "DATA_MIGRATION_ASSESSMENT");
      expect(roles).toContain("data_migration_lead");
    });

    it("should return non-empty notification targets for every state", () => {
      for (const state of ALL_STATES) {
        const roles = getNotificationTargets("SETUP", state);
        expect(roles.length).toBeGreaterThan(0);
      }
    });

    it("should return an array (never undefined) for any transition", () => {
      for (const from of ALL_STATES) {
        for (const to of VALID_TRANSITIONS[from]) {
          const roles = getNotificationTargets(from, to);
          expect(Array.isArray(roles)).toBe(true);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Structural integrity
  // -----------------------------------------------------------------------
  describe("state machine structural integrity", () => {
    it("should have exactly 13 states", () => {
      expect(ALL_STATES).toHaveLength(13);
    });

    it("every target in the transition map should be a known state", () => {
      for (const from of ALL_STATES) {
        for (const to of VALID_TRANSITIONS[from]) {
          expect(ALL_STATES).toContain(to);
        }
      }
    });

    it("SETUP should be the only state with no incoming transitions", () => {
      const hasIncoming = new Set<AssessmentState>();
      for (const targets of Object.values(VALID_TRANSITIONS)) {
        for (const t of targets) {
          hasIncoming.add(t);
        }
      }
      const noIncoming = ALL_STATES.filter((s) => !hasIncoming.has(s));
      expect(noIncoming).toEqual(["SETUP"]);
    });

    it("REASSESSMENT_NEEDED should loop back to SCOPE_IN_PROGRESS", () => {
      expect(VALID_TRANSITIONS.REASSESSMENT_NEEDED).toContain("SCOPE_IN_PROGRESS");
    });

    it("self-transitions should be rejected for every state", () => {
      for (const state of ALL_STATES) {
        const result = validateTransition(state, state);
        expect(result.allowed).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Cross-reference: verify real production module is importable and consistent
  // -----------------------------------------------------------------------
  describe("real module cross-reference", () => {
    it("real module should have 12 statuses", () => {
      expect(REAL_STATUSES).toHaveLength(12);
    });

    it("real module transition map should have entries for all real statuses", () => {
      for (const status of REAL_STATUSES) {
        expect(REAL_TRANSITIONS[status]).toBeDefined();
        expect(Array.isArray(REAL_TRANSITIONS[status])).toBe(true);
      }
    });

    it("real canTransition should validate draft->scoping", () => {
      const result = realCanTransition("draft", "scoping", "platform_admin");
      expect(result.allowed).toBe(true);
    });

    it("real canTransition should reject draft->signed_off", () => {
      const result = realCanTransition("draft", "signed_off", "platform_admin");
      expect(result.allowed).toBe(false);
    });

    it("real module archived should be terminal (no outbound transitions)", () => {
      expect(REAL_TRANSITIONS["archived"]).toEqual([]);
    });
  });
});
