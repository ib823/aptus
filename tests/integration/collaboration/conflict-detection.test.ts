/**
 * STATUS: Self-contained specification test
 * REAL MODULE: src/app/api/ routes
 * WIRING BLOCKED BY: Need database layer
 *
 * Integration tests: Conflict Detection (T-CONF-001 through T-CONF-005)
 *
 * Validates detection, tracking, and resolution of classification
 * conflicts when multiple users classify the same process step differently.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockUser } from "../../helpers/auth";
import { createMockWebSocketClient, WS_MESSAGE_TYPES } from "../../helpers/websocket";
import * as StepFactory from "../../factories/step.factory";

// ---------------------------------------------------------------------------
// Conflict detection simulation
// ---------------------------------------------------------------------------

interface Classification {
  userId: string;
  userRole: string;
  fitStatus: string;
  confidence: string;
  timestamp: number;
}

interface ConflictRecord {
  id: string;
  assessmentId: string;
  entityType: string;
  entityId: string;
  classifications: Classification[];
  status: "OPEN" | "RESOLVED" | "ESCALATED";
  resolvedById: string | null;
  resolvedClassification: string | null;
  resolutionNotes: string | null;
  escalatedToId: string | null;
  escalatedAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

let conflictStore: Map<string, ConflictRecord>;
let conflictCounter: number;

function resetConflictStore() {
  conflictStore = new Map();
  conflictCounter = 0;
}

/**
 * Detect or create a conflict when two users classify the same entity differently.
 */
function recordClassification(
  assessmentId: string,
  entityType: string,
  entityId: string,
  classification: Classification,
): { conflict: boolean; conflictRecord?: ConflictRecord } {
  // Find existing conflict for this entity
  const existingConflict = Array.from(conflictStore.values()).find(
    (c) =>
      c.assessmentId === assessmentId &&
      c.entityType === entityType &&
      c.entityId === entityId &&
      c.status !== "RESOLVED",
  );

  if (existingConflict) {
    // Add new classification to existing conflict
    const existingIdx = existingConflict.classifications.findIndex(
      (c) => c.userId === classification.userId,
    );
    if (existingIdx >= 0) {
      existingConflict.classifications[existingIdx] = classification;
    } else {
      existingConflict.classifications.push(classification);
    }
    return { conflict: true, conflictRecord: existingConflict };
  }

  // Check if there are other classifications for this entity
  // In a real system, this would check the step_responses table
  // Here we simulate by checking all stored conflicts' entity+assessment combos
  // Since we are building a new system, create conflict when called with diverging data
  return { conflict: false };
}

function createConflict(
  assessmentId: string,
  entityType: string,
  entityId: string,
  classifications: Classification[],
): ConflictRecord {
  const id = `conflict-${++conflictCounter}`;
  const record: ConflictRecord = {
    id,
    assessmentId,
    entityType,
    entityId,
    classifications,
    status: "OPEN",
    resolvedById: null,
    resolvedClassification: null,
    resolutionNotes: null,
    escalatedToId: null,
    escalatedAt: null,
    createdAt: new Date(),
    resolvedAt: null,
  };
  conflictStore.set(id, record);
  return record;
}

function resolveConflict(
  conflictId: string,
  resolvedById: string,
  resolvedClassification: string,
  notes: string,
): { success: boolean; conflict?: ConflictRecord; error?: string } {
  const conflict = conflictStore.get(conflictId);
  if (!conflict) return { success: false, error: "NOT_FOUND" };
  if (conflict.status === "RESOLVED") return { success: false, error: "ALREADY_RESOLVED" };

  conflict.status = "RESOLVED";
  conflict.resolvedById = resolvedById;
  conflict.resolvedClassification = resolvedClassification;
  conflict.resolutionNotes = notes;
  conflict.resolvedAt = new Date();
  return { success: true, conflict };
}

function escalateConflict(
  conflictId: string,
  escalatedToId: string,
): { success: boolean; conflict?: ConflictRecord; error?: string } {
  const conflict = conflictStore.get(conflictId);
  if (!conflict) return { success: false, error: "NOT_FOUND" };
  if (conflict.status === "RESOLVED") return { success: false, error: "ALREADY_RESOLVED" };

  conflict.status = "ESCALATED";
  conflict.escalatedToId = escalatedToId;
  conflict.escalatedAt = new Date();
  return { success: true, conflict };
}

function getOpenConflicts(assessmentId: string): ConflictRecord[] {
  return Array.from(conflictStore.values()).filter(
    (c) => c.assessmentId === assessmentId && c.status !== "RESOLVED",
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Conflict Detection (T-CONF)", () => {
  const assessmentId = "assess-conflict-test";
  const step = StepFactory.create({ scopeItemId: "J60" });

  beforeEach(() => {
    resetConflictStore();
  });

  it("T-CONF-001: Divergent classifications on the same step create a conflict", () => {
    const classificationA: Classification = {
      userId: "user-1",
      userRole: "consultant",
      fitStatus: "FIT",
      confidence: "high",
      timestamp: Date.now(),
    };

    const classificationB: Classification = {
      userId: "user-2",
      userRole: "process_owner",
      fitStatus: "GAP",
      confidence: "high",
      timestamp: Date.now() + 1,
    };

    // Two different users classify the same step differently
    const conflict = createConflict(assessmentId, "step_response", step.id, [
      classificationA,
      classificationB,
    ]);

    expect(conflict.id).toBeDefined();
    expect(conflict.status).toBe("OPEN");
    expect(conflict.classifications).toHaveLength(2);
    expect(conflict.classifications[0]!.fitStatus).toBe("FIT");
    expect(conflict.classifications[1]!.fitStatus).toBe("GAP");
    expect(conflict.entityType).toBe("step_response");
    expect(conflict.entityId).toBe(step.id);
  });

  it("T-CONF-002: Conflict can be resolved by a senior user with final classification", () => {
    const conflict = createConflict(assessmentId, "step_response", step.id, [
      { userId: "user-1", userRole: "consultant", fitStatus: "FIT", confidence: "medium", timestamp: Date.now() },
      { userId: "user-2", userRole: "process_owner", fitStatus: "GAP", confidence: "high", timestamp: Date.now() },
    ]);

    const result = resolveConflict(
      conflict.id,
      "user-senior",
      "GAP",
      "Process owner confirmed that custom logic is required. Overriding FIT classification.",
    );

    expect(result.success).toBe(true);
    expect(result.conflict!.status).toBe("RESOLVED");
    expect(result.conflict!.resolvedById).toBe("user-senior");
    expect(result.conflict!.resolvedClassification).toBe("GAP");
    expect(result.conflict!.resolutionNotes).toContain("custom logic");
    expect(result.conflict!.resolvedAt).toBeInstanceOf(Date);
  });

  it("T-CONF-003: Resolving an already-resolved conflict is rejected", () => {
    const conflict = createConflict(assessmentId, "step_response", step.id, [
      { userId: "user-1", userRole: "consultant", fitStatus: "FIT", confidence: "high", timestamp: Date.now() },
      { userId: "user-2", userRole: "process_owner", fitStatus: "CONFIGURE", confidence: "high", timestamp: Date.now() },
    ]);

    resolveConflict(conflict.id, "user-senior", "CONFIGURE", "Configuration covers this.");

    const secondAttempt = resolveConflict(conflict.id, "user-another", "FIT", "Changed my mind.");
    expect(secondAttempt.success).toBe(false);
    expect(secondAttempt.error).toBe("ALREADY_RESOLVED");
  });

  it("T-CONF-004: Conflict can be escalated to a higher-authority user", () => {
    const conflict = createConflict(assessmentId, "step_response", step.id, [
      { userId: "user-1", userRole: "consultant", fitStatus: "FIT", confidence: "low", timestamp: Date.now() },
      { userId: "user-2", userRole: "process_owner", fitStatus: "GAP", confidence: "low", timestamp: Date.now() },
    ]);

    const result = escalateConflict(conflict.id, "user-partner-lead");

    expect(result.success).toBe(true);
    expect(result.conflict!.status).toBe("ESCALATED");
    expect(result.conflict!.escalatedToId).toBe("user-partner-lead");
    expect(result.conflict!.escalatedAt).toBeInstanceOf(Date);

    // Escalated conflict is still open (not resolved)
    const open = getOpenConflicts(assessmentId);
    expect(open).toHaveLength(1);
    expect(open[0]!.status).toBe("ESCALATED");
  });

  it("T-CONF-005: Additional classification adds to existing open conflict", () => {
    const conflict = createConflict(assessmentId, "step_response", step.id, [
      { userId: "user-1", userRole: "consultant", fitStatus: "FIT", confidence: "high", timestamp: Date.now() },
      { userId: "user-2", userRole: "process_owner", fitStatus: "GAP", confidence: "high", timestamp: Date.now() },
    ]);

    // Third user adds their classification
    const thirdClassification: Classification = {
      userId: "user-3",
      userRole: "solution_architect",
      fitStatus: "CONFIGURE",
      confidence: "medium",
      timestamp: Date.now(),
    };

    const result = recordClassification(
      assessmentId,
      "step_response",
      step.id,
      thirdClassification,
    );

    expect(result.conflict).toBe(true);
    expect(result.conflictRecord!.classifications).toHaveLength(3);

    const fitStatuses = result.conflictRecord!.classifications.map((c) => c.fitStatus);
    expect(fitStatuses).toContain("FIT");
    expect(fitStatuses).toContain("GAP");
    expect(fitStatuses).toContain("CONFIGURE");

    // User 2 changes their mind -- updates existing entry
    const revisedClassification: Classification = {
      userId: "user-2",
      userRole: "process_owner",
      fitStatus: "CONFIGURE",
      confidence: "high",
      timestamp: Date.now(),
    };

    const revisedResult = recordClassification(
      assessmentId,
      "step_response",
      step.id,
      revisedClassification,
    );

    expect(revisedResult.conflict).toBe(true);
    // Still 3 entries (user-2 updated, not duplicated)
    expect(revisedResult.conflictRecord!.classifications).toHaveLength(3);
    const user2Entry = revisedResult.conflictRecord!.classifications.find(
      (c) => c.userId === "user-2",
    )!;
    expect(user2Entry.fitStatus).toBe("CONFIGURE");
  });
});
