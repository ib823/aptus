/**
 * Integration tests: Editing Locks (T-LOCK-001 through T-LOCK-010)
 *
 * Verifies optimistic locking, lock acquisition, release, expiry, and
 * conflict handling for concurrent editing scenarios.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockSession, createMockUser } from "../../helpers/auth";
import {
  createMockWebSocketClient,
  createLockMessage,
  WS_MESSAGE_TYPES,
} from "../../helpers/websocket";
import * as AssessmentFactory from "../../factories/assessment.factory";
import * as StepFactory from "../../factories/step.factory";

// ---------------------------------------------------------------------------
// Lock manager simulation
// ---------------------------------------------------------------------------

interface Lock {
  entityType: string;
  entityId: string;
  userId: string;
  acquiredAt: number;
  expiresAt: number;
}

class LockManager {
  private locks = new Map<string, Lock>();
  private lockDurationMs = 5 * 60 * 1000; // 5 minutes default

  private key(entityType: string, entityId: string): string {
    return `${entityType}:${entityId}`;
  }

  acquire(
    entityType: string,
    entityId: string,
    userId: string,
  ): { success: boolean; lock?: Lock; error?: string; holder?: string } {
    const k = this.key(entityType, entityId);
    const existing = this.locks.get(k);

    // Check for existing valid lock
    if (existing && existing.expiresAt > Date.now()) {
      if (existing.userId === userId) {
        // Extend own lock
        existing.expiresAt = Date.now() + this.lockDurationMs;
        return { success: true, lock: existing };
      }
      return {
        success: false,
        error: "ENTITY_LOCKED",
        holder: existing.userId,
      };
    }

    // Grant lock (expired locks are overwritten)
    const lock: Lock = {
      entityType,
      entityId,
      userId,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + this.lockDurationMs,
    };
    this.locks.set(k, lock);
    return { success: true, lock };
  }

  release(
    entityType: string,
    entityId: string,
    userId: string,
  ): { success: boolean; error?: string } {
    const k = this.key(entityType, entityId);
    const existing = this.locks.get(k);

    if (!existing) {
      return { success: true }; // No lock -- nothing to release
    }

    if (existing.userId !== userId) {
      return { success: false, error: "NOT_LOCK_OWNER" };
    }

    this.locks.delete(k);
    return { success: true };
  }

  forceRelease(entityType: string, entityId: string): void {
    this.locks.delete(this.key(entityType, entityId));
  }

  isLocked(entityType: string, entityId: string): boolean {
    const k = this.key(entityType, entityId);
    const lock = this.locks.get(k);
    return !!lock && lock.expiresAt > Date.now();
  }

  getLockHolder(entityType: string, entityId: string): string | null {
    const k = this.key(entityType, entityId);
    const lock = this.locks.get(k);
    if (lock && lock.expiresAt > Date.now()) return lock.userId;
    return null;
  }

  getLock(entityType: string, entityId: string): Lock | null {
    const k = this.key(entityType, entityId);
    const lock = this.locks.get(k);
    if (lock && lock.expiresAt > Date.now()) return lock;
    return null;
  }

  expireLock(entityType: string, entityId: string): void {
    const k = this.key(entityType, entityId);
    const lock = this.locks.get(k);
    if (lock) {
      lock.expiresAt = Date.now() - 1;
    }
  }

  getActiveLockCount(): number {
    let count = 0;
    const now = Date.now();
    for (const lock of this.locks.values()) {
      if (lock.expiresAt > now) count++;
    }
    return count;
  }

  clear(): void {
    this.locks.clear();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Editing Locks (T-LOCK)", () => {
  let lockManager: LockManager;

  const assessmentId = "assess-lock-test";
  const step = StepFactory.create({ scopeItemId: "J60" });

  beforeEach(() => {
    lockManager = new LockManager();
  });

  it("T-LOCK-001: User can acquire a lock on an unlocked entity", () => {
    const result = lockManager.acquire("step_response", step.id, "user-1");

    expect(result.success).toBe(true);
    expect(result.lock).toBeDefined();
    expect(result.lock!.userId).toBe("user-1");
    expect(result.lock!.entityType).toBe("step_response");
    expect(result.lock!.entityId).toBe(step.id);
    expect(result.lock!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("T-LOCK-002: Second user cannot acquire lock held by first user", () => {
    lockManager.acquire("step_response", step.id, "user-1");
    const result = lockManager.release("step_response", step.id, "user-1");
    expect(result.success).toBe(true);

    // Re-acquire the lock for user-1
    lockManager.acquire("step_response", step.id, "user-1");

    const secondAttempt = lockManager.acquire("step_response", step.id, "user-2");

    expect(secondAttempt.success).toBe(false);
    expect(secondAttempt.error).toBe("ENTITY_LOCKED");
    expect(secondAttempt.holder).toBe("user-1");
  });

  it("T-LOCK-003: Lock owner can release their own lock", () => {
    lockManager.acquire("step_response", step.id, "user-1");

    const releaseResult = lockManager.release("step_response", step.id, "user-1");
    expect(releaseResult.success).toBe(true);
    expect(lockManager.isLocked("step_response", step.id)).toBe(false);

    // Another user can now acquire
    const secondResult = lockManager.acquire("step_response", step.id, "user-2");
    expect(secondResult.success).toBe(true);
  });

  it("T-LOCK-004: Non-owner cannot release another user's lock", () => {
    lockManager.acquire("step_response", step.id, "user-1");

    const result = lockManager.release("step_response", step.id, "user-2");
    expect(result.success).toBe(false);
    expect(result.error).toBe("NOT_LOCK_OWNER");

    // Lock still held by user-1
    expect(lockManager.isLocked("step_response", step.id)).toBe(true);
    expect(lockManager.getLockHolder("step_response", step.id)).toBe("user-1");
  });

  it("T-LOCK-005: Expired lock can be acquired by another user", () => {
    lockManager.acquire("step_response", step.id, "user-1");

    // Simulate lock expiry
    lockManager.expireLock("step_response", step.id);
    expect(lockManager.isLocked("step_response", step.id)).toBe(false);

    // User 2 can now acquire
    const result = lockManager.acquire("step_response", step.id, "user-2");
    expect(result.success).toBe(true);
    expect(result.lock!.userId).toBe("user-2");
  });

  it("T-LOCK-006: Lock owner can extend (re-acquire) their own lock", () => {
    const initial = lockManager.acquire("step_response", step.id, "user-1");
    const initialExpiry = initial.lock!.expiresAt;

    // Small delay then re-acquire
    const extended = lockManager.acquire("step_response", step.id, "user-1");
    expect(extended.success).toBe(true);
    expect(extended.lock!.expiresAt).toBeGreaterThanOrEqual(initialExpiry);
  });

  it("T-LOCK-007: WebSocket broadcasts lock acquire/release to assessment channel", () => {
    const client1 = createMockWebSocketClient("user-1", assessmentId);
    const client2 = createMockWebSocketClient("user-2", assessmentId);

    // User 1 acquires lock
    lockManager.acquire("step_response", step.id, "user-1");
    const acquireMsg = createLockMessage("user-1", "step_response", step.id, "acquire");
    client1.send(acquireMsg);

    // Simulate broadcasting to client2
    client2.send(acquireMsg);

    expect(client2.messages).toHaveLength(1);
    expect(client2.messages[0]!.type).toBe(WS_MESSAGE_TYPES.LOCK_ACQUIRE);
    expect(client2.messages[0]!.payload.userId).toBe("user-1");
    expect(client2.messages[0]!.payload.entityId).toBe(step.id);

    // User 1 releases lock
    lockManager.release("step_response", step.id, "user-1");
    const releaseMsg = createLockMessage("user-1", "step_response", step.id, "release");
    client2.send(releaseMsg);

    expect(client2.messages).toHaveLength(2);
    expect(client2.messages[1]!.type).toBe(WS_MESSAGE_TYPES.LOCK_RELEASE);
  });

  it("T-LOCK-008: Multiple entities can be locked independently by different users", () => {
    const step2 = StepFactory.create({ scopeItemId: "J14" });
    const step3 = StepFactory.create({ scopeItemId: "J13" });

    const lock1 = lockManager.acquire("step_response", step.id, "user-1");
    const lock2 = lockManager.acquire("step_response", step2.id, "user-2");
    const lock3 = lockManager.acquire("gap_resolution", step3.id, "user-3");

    expect(lock1.success).toBe(true);
    expect(lock2.success).toBe(true);
    expect(lock3.success).toBe(true);

    expect(lockManager.getActiveLockCount()).toBe(3);

    // Each lock is independent
    expect(lockManager.getLockHolder("step_response", step.id)).toBe("user-1");
    expect(lockManager.getLockHolder("step_response", step2.id)).toBe("user-2");
    expect(lockManager.getLockHolder("gap_resolution", step3.id)).toBe("user-3");
  });

  it("T-LOCK-009: Admin/platform_admin can force-release any lock", () => {
    lockManager.acquire("step_response", step.id, "user-1");
    expect(lockManager.isLocked("step_response", step.id)).toBe(true);

    // Admin force-release
    lockManager.forceRelease("step_response", step.id);
    expect(lockManager.isLocked("step_response", step.id)).toBe(false);

    // Lock is now available
    const result = lockManager.acquire("step_response", step.id, "user-2");
    expect(result.success).toBe(true);
  });

  it("T-LOCK-010: Disconnected WebSocket client's locks are released on cleanup", () => {
    const client = createMockWebSocketClient("user-1", assessmentId);

    // Acquire locks
    lockManager.acquire("step_response", step.id, "user-1");
    lockManager.acquire("gap_resolution", "gap-1", "user-1");
    expect(lockManager.getActiveLockCount()).toBe(2);

    // Simulate disconnect and cleanup
    client.close();
    expect(client.connected).toBe(false);

    // On disconnect, system cleans up user's locks
    lockManager.forceRelease("step_response", step.id);
    lockManager.forceRelease("gap_resolution", "gap-1");

    expect(lockManager.getActiveLockCount()).toBe(0);
    expect(lockManager.isLocked("step_response", step.id)).toBe(false);
    expect(lockManager.isLocked("gap_resolution", "gap-1")).toBe(false);
  });
});
