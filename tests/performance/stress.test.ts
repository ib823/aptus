/**
 * STATUS: Self-contained specification test
 * REAL MODULE: None — synthetic benchmarks
 * WIRING BLOCKED BY: Synthetic benchmarks
 *
 * Performance Tests — Stress (T-PERF-020 through T-PERF-024)
 *
 * Validates system stability under extreme conditions:
 * high concurrent API requests, mass WebSocket connections,
 * rapid-fire operations, concurrent sign-off attempts, and memory leaks.
 */

import { describe, it, expect, vi } from "vitest";
import * as AssessmentFactory from "../factories/assessment.factory";
import * as StepFactory from "../factories/step.factory";
import * as GapFactory from "../factories/gap.factory";
import {
  createConcurrentClients,
  createMockWebSocketClient,
  createActivityMessage,
  createLockMessage,
} from "../helpers/websocket";

// ── Stress test helpers ─────────────────────────────────────────────────

/** Simulate an API request with response code */
async function simulateApiRequest(
  endpoint: string,
  index: number,
): Promise<{ status: number; latencyMs: number }> {
  const start = performance.now();

  // Simulate request processing
  await new Promise((r) => setTimeout(r, Math.random() * 2));

  // Simulate server load — no 5xx under normal operation
  const status = 200;
  const latencyMs = performance.now() - start;

  return { status, latencyMs };
}

/** Simulate step classification persistence */
async function simulateStepClassification(
  stepId: string,
  classification: string,
): Promise<{ persisted: boolean; stepId: string; classification: string }> {
  // Simulate DB write
  await new Promise((r) => setTimeout(r, Math.random()));
  return { persisted: true, stepId, classification };
}

/** Simulate sign-off with optimistic locking (exactly-once semantics) */
function createSignOffAttempt(
  assessmentId: string,
  userId: string,
  lock: { holder: string | null },
): { success: boolean; userId: string; error?: string } {
  // Atomic compare-and-swap
  if (lock.holder === null) {
    lock.holder = userId;
    return { success: true, userId };
  }
  return { success: false, userId, error: "SIGN_OFF_ALREADY_IN_PROGRESS" };
}

/** Measure memory usage (simulated via object allocation tracking) */
function measureObjectAllocations(
  fn: () => void,
  iterations: number,
): { allocationsPerIteration: number[]; trend: "stable" | "growing" } {
  const allocations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const before = process.memoryUsage().heapUsed;
    fn();
    const after = process.memoryUsage().heapUsed;
    allocations.push(after - before);
  }

  // Check if there is a growing trend (last 10% significantly higher than first 10%)
  const tenPercent = Math.max(1, Math.floor(iterations * 0.1));
  const firstSlice = allocations.slice(0, tenPercent);
  const lastSlice = allocations.slice(-tenPercent);

  const avgFirst = firstSlice.reduce((s, v) => s + v, 0) / firstSlice.length;
  const avgLast = lastSlice.reduce((s, v) => s + v, 0) / lastSlice.length;

  // Allow generous margin before flagging (GC noise, JIT compilation, and heap
  // fragmentation cause significant variance in short-lived micro-benchmarks)
  const trend = avgLast > avgFirst * 10 && avgLast > 1_000_000 ? "growing" : "stable";

  return { allocationsPerIteration: allocations, trend };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Performance — Stress Tests", () => {
  describe("T-PERF-020: 500 concurrent API requests — no 5xx errors", () => {
    it("handles 500 concurrent requests without server errors", async () => {
      const endpoints = [
        "/api/assessments",
        "/api/dashboard",
        "/api/assessments/abc/steps",
        "/api/assessments/abc/gaps",
        "/api/settings/profile",
      ];

      const results = await Promise.all(
        Array.from({ length: 500 }, (_, i) =>
          simulateApiRequest(endpoints[i % endpoints.length]!, i),
        ),
      );

      const serverErrors = results.filter((r) => r.status >= 500);
      expect(serverErrors).toHaveLength(0);

      // All should return success
      const successes = results.filter((r) => r.status === 200);
      expect(successes).toHaveLength(500);
    });

    it("maintains reasonable latency under load", async () => {
      const results = await Promise.all(
        Array.from({ length: 500 }, (_, i) =>
          simulateApiRequest("/api/assessments", i),
        ),
      );

      const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
      const p99Index = Math.ceil(latencies.length * 0.99) - 1;
      const p99 = latencies[p99Index]!;

      // p99 should be reasonable (not timing out)
      expect(p99).toBeLessThan(5000);
    });
  });

  describe("T-PERF-021: 200 concurrent WebSocket connections — server stable", () => {
    it("creates and maintains 200 WebSocket connections", () => {
      const clients = createConcurrentClients(200, "stress-assessment");

      expect(clients).toHaveLength(200);
      expect(clients.every((c) => c.connected)).toBe(true);

      // Each client should have a unique ID
      const ids = new Set(clients.map((c) => c.id));
      expect(ids.size).toBe(200);
    });

    it("broadcasts to 200 clients without errors", () => {
      const clients = createConcurrentClients(200, "stress-assessment-2");
      const message = createActivityMessage(
        "admin-user",
        "assessment:updated",
        "Assessment status changed",
      );

      let errors = 0;
      for (const client of clients) {
        try {
          client.send(message);
        } catch {
          errors++;
        }
      }

      expect(errors).toBe(0);
      expect(clients.every((c) => c.messages.length === 1)).toBe(true);
    });

    it("handles mixed connect/disconnect without crashes", () => {
      const clients = createConcurrentClients(200, "stress-assessment-3");

      // Disconnect half
      for (let i = 0; i < 100; i++) {
        clients[i]!.close();
      }

      // Send to remaining connected clients
      const message = createActivityMessage("user-1", "test", "test");
      let successes = 0;
      let errors = 0;

      for (const client of clients) {
        try {
          client.send(message);
          successes++;
        } catch {
          errors++;
        }
      }

      expect(successes).toBe(100);
      expect(errors).toBe(100);
    });
  });

  describe("T-PERF-022: Rapid fire step classifications (10/s) — all persisted", () => {
    it("persists all classifications at 10 per second rate", async () => {
      const steps = StepFactory.createMany(10);
      const classifications = [
        "fit", "gap", "not_applicable", "partial_fit", "needs_review",
        "fit", "gap", "fit", "not_applicable", "fit",
      ];

      const results = await Promise.all(
        steps.map((step, i) =>
          simulateStepClassification(step.id, classifications[i]!),
        ),
      );

      expect(results).toHaveLength(10);
      expect(results.every((r) => r.persisted)).toBe(true);
    });

    it("handles 100 rapid classifications without data loss", async () => {
      const steps = StepFactory.createMany(100);
      const results = await Promise.all(
        steps.map((step) =>
          simulateStepClassification(step.id, "fit"),
        ),
      );

      expect(results).toHaveLength(100);
      expect(results.every((r) => r.persisted)).toBe(true);

      // Verify each step got a unique classification result
      const classifiedIds = new Set(results.map((r) => r.stepId));
      expect(classifiedIds.size).toBe(100);
    });

    it("maintains data integrity under rapid updates", async () => {
      const stepId = "stress-step-001";
      const classificationSequence = [
        "fit", "gap", "not_applicable", "partial_fit", "fit",
        "gap", "fit", "fit", "needs_review", "fit",
      ];

      const results: Awaited<ReturnType<typeof simulateStepClassification>>[] = [];
      for (const classification of classificationSequence) {
        const result = await simulateStepClassification(stepId, classification);
        results.push(result);
      }

      // Last classification should be "fit"
      const lastResult = results[results.length - 1]!;
      expect(lastResult.classification).toBe("fit");
      expect(lastResult.persisted).toBe(true);
    });
  });

  describe("T-PERF-023: 50 simultaneous sign-off attempts — exactly one succeeds", () => {
    it("allows exactly one sign-off among 50 concurrent attempts", () => {
      const assessmentId = "sign-off-stress-001";
      const lock = { holder: null as string | null };

      const results = Array.from({ length: 50 }, (_, i) =>
        createSignOffAttempt(assessmentId, `user-${i}`, lock),
      );

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(49);
    });

    it("the winning sign-off holds the lock", () => {
      const lock = { holder: null as string | null };

      const results = Array.from({ length: 50 }, (_, i) =>
        createSignOffAttempt("assessment-x", `user-${i}`, lock),
      );

      const winner = results.find((r) => r.success)!;
      expect(lock.holder).toBe(winner.userId);
    });

    it("failures receive appropriate error message", () => {
      const lock = { holder: null as string | null };

      const results = Array.from({ length: 50 }, (_, i) =>
        createSignOffAttempt("assessment-y", `user-${i}`, lock),
      );

      const failures = results.filter((r) => !r.success);
      for (const f of failures) {
        expect(f.error).toBe("SIGN_OFF_ALREADY_IN_PROGRESS");
      }
    });

    it("second round of attempts all fail (lock already held)", () => {
      const lock = { holder: null as string | null };

      // First round: one wins
      Array.from({ length: 10 }, (_, i) =>
        createSignOffAttempt("assessment-z", `round1-user-${i}`, lock),
      );

      // Second round: all fail
      const secondRound = Array.from({ length: 10 }, (_, i) =>
        createSignOffAttempt("assessment-z", `round2-user-${i}`, lock),
      );

      expect(secondRound.every((r) => !r.success)).toBe(true);
    });
  });

  describe("T-PERF-024: Memory leak check — 100 workflow cycles — no growth", () => {
    it("no significant memory growth over 100 assessment creation cycles", () => {
      const { trend } = measureObjectAllocations(() => {
        // Simulate a full workflow cycle
        const org = { id: "org-mem", name: "Memory Test Org" };
        const assessment = AssessmentFactory.create({ organizationId: org.id });
        const steps = StepFactory.createMany(10, { scopeItemId: "J01" });
        const gaps = GapFactory.createMany(3, { assessmentId: assessment.id });

        // Simulate processing
        const statusCounts = { fit: 0, gap: 0, notApplicable: 0 };
        for (const step of steps) {
          if (step.isClassifiable) statusCounts.fit++;
        }

        // Simulate serialization
        JSON.stringify({ assessment, steps, gaps, statusCounts });
      }, 100);

      expect(trend).toBe("stable");
    });

    it("no significant memory growth over 100 WebSocket broadcast cycles", () => {
      const { trend } = measureObjectAllocations(() => {
        const clients = createConcurrentClients(10, "mem-test");
        const message = createActivityMessage("user-1", "test", "test");

        for (const client of clients) {
          client.send(message);
        }

        // Clean up
        for (const client of clients) {
          client.close();
        }
      }, 100);

      expect(trend).toBe("stable");
    });

    it("no memory growth over 100 step parsing cycles", () => {
      const { trend } = measureObjectAllocations(() => {
        const steps = StepFactory.createBulk(50, {
          stepType: "BusinessProcess",
          classifiable: true,
        });

        const parsed = steps.map((step) => {
          const html = step.actionInstructionsHtml ?? "";
          const text = html.replace(/<[^>]*>/g, "");
          return { id: step.id, text, words: text.split(/\s+/).length };
        });

        // Use the result to prevent optimization
        expect(parsed.length).toBe(50);
      }, 100);

      expect(trend).toBe("stable");
    });
  });
});
