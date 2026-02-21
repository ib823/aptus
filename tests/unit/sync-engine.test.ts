/** Unit tests for sync-engine.ts (Phase 27) */

import { describe, it, expect } from "vitest";
import {
  validateSyncItem,
  detectConflict,
  categorizeSyncResults,
  shouldRetry,
  isOfflineSyncItem,
} from "@/lib/pwa/sync-engine";

describe("validateSyncItem", () => {
  const validItem = {
    clientId: "abc-123",
    action: "classify_step",
    assessmentId: "assess-1",
    payload: { stepId: "s1" },
    queuedAt: "2025-01-01T00:00:00Z",
  };

  it("accepts a valid sync item", () => {
    expect(validateSyncItem(validItem)).toEqual({ valid: true });
  });

  it("rejects null", () => {
    const result = validateSyncItem(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects undefined", () => {
    const result = validateSyncItem(undefined);
    expect(result.valid).toBe(false);
  });

  it("rejects a number", () => {
    expect(validateSyncItem(42).valid).toBe(false);
  });

  it("rejects missing clientId", () => {
    const { clientId: _clientId, ...rest } = validItem;
    void _clientId;
    expect(validateSyncItem(rest).valid).toBe(false);
  });

  it("rejects empty clientId", () => {
    expect(validateSyncItem({ ...validItem, clientId: "" }).valid).toBe(false);
  });

  it("rejects invalid action", () => {
    expect(validateSyncItem({ ...validItem, action: "nope" }).valid).toBe(false);
  });

  it("rejects missing assessmentId", () => {
    const { assessmentId: _assessmentId, ...rest } = validItem;
    void _assessmentId;
    expect(validateSyncItem(rest).valid).toBe(false);
  });

  it("rejects empty assessmentId", () => {
    expect(validateSyncItem({ ...validItem, assessmentId: "" }).valid).toBe(false);
  });

  it("rejects null payload", () => {
    expect(validateSyncItem({ ...validItem, payload: null }).valid).toBe(false);
  });

  it("rejects array payload", () => {
    expect(validateSyncItem({ ...validItem, payload: [1, 2] }).valid).toBe(false);
  });

  it("rejects missing queuedAt", () => {
    const { queuedAt: _queuedAt, ...rest } = validItem;
    void _queuedAt;
    expect(validateSyncItem(rest).valid).toBe(false);
  });

  it("rejects empty queuedAt", () => {
    expect(validateSyncItem({ ...validItem, queuedAt: "" }).valid).toBe(false);
  });

  it("accepts all valid actions", () => {
    for (const action of ["classify_step", "add_note", "create_gap", "update_scope"]) {
      expect(validateSyncItem({ ...validItem, action }).valid).toBe(true);
    }
  });
});

describe("detectConflict", () => {
  it("returns false when server has no data", () => {
    expect(detectConflict(null, "2025-01-01T00:00:00Z")).toBe(false);
  });

  it("returns true when server is newer", () => {
    const serverTime = new Date("2025-06-01T12:00:00Z");
    expect(detectConflict(serverTime, "2025-01-01T00:00:00Z")).toBe(true);
  });

  it("returns false when client is newer", () => {
    const serverTime = new Date("2025-01-01T00:00:00Z");
    expect(detectConflict(serverTime, "2025-06-01T12:00:00Z")).toBe(false);
  });

  it("returns false when timestamps are equal", () => {
    const time = new Date("2025-06-01T12:00:00Z");
    expect(detectConflict(time, "2025-06-01T12:00:00Z")).toBe(false);
  });
});

describe("categorizeSyncResults", () => {
  it("groups results by status", () => {
    const results = [
      { clientId: "a", status: "synced" },
      { clientId: "b", status: "conflict" },
      { clientId: "c", status: "synced" },
      { clientId: "d", status: "failed" },
    ];
    const categorized = categorizeSyncResults(results);
    expect(categorized.synced).toEqual(["a", "c"]);
    expect(categorized.conflicts).toEqual(["b"]);
    expect(categorized.failed).toEqual(["d"]);
  });

  it("handles empty results", () => {
    const categorized = categorizeSyncResults([]);
    expect(categorized.synced).toEqual([]);
    expect(categorized.conflicts).toEqual([]);
    expect(categorized.failed).toEqual([]);
  });

  it("treats unknown statuses as failed", () => {
    const results = [{ clientId: "x", status: "unknown" }];
    expect(categorizeSyncResults(results).failed).toEqual(["x"]);
  });
});

describe("shouldRetry", () => {
  it("returns true when retry count is below limit", () => {
    expect(shouldRetry(0)).toBe(true);
    expect(shouldRetry(1)).toBe(true);
    expect(shouldRetry(2)).toBe(true);
  });

  it("returns false when retry count equals limit", () => {
    expect(shouldRetry(3)).toBe(false);
  });

  it("returns false when retry count exceeds limit", () => {
    expect(shouldRetry(5)).toBe(false);
  });

  it("supports custom max retries", () => {
    expect(shouldRetry(4, 5)).toBe(true);
    expect(shouldRetry(5, 5)).toBe(false);
  });
});

describe("isOfflineSyncItem", () => {
  it("returns true for valid items", () => {
    expect(
      isOfflineSyncItem({
        clientId: "x",
        action: "add_note",
        assessmentId: "a1",
        payload: {},
        queuedAt: "2025-01-01T00:00:00Z",
      }),
    ).toBe(true);
  });

  it("returns false for invalid items", () => {
    expect(isOfflineSyncItem({ bad: true })).toBe(false);
  });
});
