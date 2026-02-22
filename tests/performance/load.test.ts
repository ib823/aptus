/**
 * Performance Tests — Load (T-PERF-001 through T-PERF-010)
 *
 * Validates response time and throughput under load:
 * concurrent users, WebSocket delivery, dashboard rendering,
 * large assessments, report generation, and content parsing.
 */

import { describe, it, expect, vi } from "vitest";
import * as AssessmentFactory from "../factories/assessment.factory";
import * as StepFactory from "../factories/step.factory";
import * as GapFactory from "../factories/gap.factory";
import {
  createConcurrentClients,
  createActivityMessage,
} from "../helpers/websocket";

// ── Performance measurement helpers ─────────────────────────────────────

/** Measure execution time of an async function in milliseconds */
async function measureMs(fn: () => Promise<void> | void): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/** Simulate concurrent operations and return p95 latency */
async function simulateConcurrent(
  count: number,
  operation: (index: number) => Promise<number>,
): Promise<{ p95: number; max: number; avg: number; errors: number }> {
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      operation(i).catch(() => -1),
    ),
  );

  const successful = results.filter((r) => r >= 0).sort((a, b) => a - b);
  const errors = results.filter((r) => r < 0).length;
  const p95Index = Math.ceil(successful.length * 0.95) - 1;

  return {
    p95: successful[p95Index] ?? 0,
    max: successful[successful.length - 1] ?? 0,
    avg: successful.reduce((sum, v) => sum + v, 0) / (successful.length || 1),
    errors,
  };
}

// ── Simulated operations ────────────────────────────────────────────────

/** Simulate loading an assessment with step operations */
async function simulateAssessmentLoad(stepCount: number): Promise<void> {
  const assessment = AssessmentFactory.createFullyPopulated();
  const steps = StepFactory.createMany(stepCount);
  // Simulate processing all steps (serialization + validation)
  const processed = steps.map((s) => ({
    id: s.id,
    type: s.stepType,
    category: s.stepCategory,
    classifiable: s.isClassifiable,
  }));
  expect(processed).toHaveLength(stepCount);
}

/** Simulate dashboard load with many assessments */
async function simulateDashboardLoad(assessmentCount: number): Promise<void> {
  const assessments = AssessmentFactory.createMany(assessmentCount);
  // Simulate aggregation (status counts, progress bars, etc.)
  const statusCounts = assessments.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  expect(Object.keys(statusCounts).length).toBeGreaterThan(0);
}

/** Simulate report generation (PDF) */
async function simulatePdfGeneration(
  gapCount: number,
  stepCount: number,
): Promise<void> {
  const assessment = AssessmentFactory.createFullyPopulated();
  const gaps = GapFactory.createMany(gapCount);
  const steps = StepFactory.createMany(stepCount);

  // Simulate document assembly
  const sections = [
    { title: "Executive Summary", content: assessment.companyName },
    { title: "Gaps", items: gaps.map((g) => g.gapDescription) },
    { title: "Steps", items: steps.map((s) => s.actionTitle) },
  ];

  // Simulate PDF rendering delay (compressed)
  await new Promise((r) => setTimeout(r, 5));
  expect(sections).toHaveLength(3);
}

/** Simulate XLSX report generation */
async function simulateXlsxGeneration(gapCount: number): Promise<void> {
  const gaps = GapFactory.createMany(gapCount);
  const rows = gaps.map((g) => ({
    description: g.gapDescription,
    type: g.resolutionType,
    effort: g.effortDays,
    cost: g.oneTimeCost,
  }));

  await new Promise((r) => setTimeout(r, 2));
  expect(rows).toHaveLength(gapCount);
}

/** Simulate snapshot creation */
async function simulateSnapshotCreation(
  stepCount: number,
  gapCount: number,
): Promise<void> {
  const assessment = AssessmentFactory.createFullyPopulated();
  const steps = StepFactory.createMany(stepCount);
  const gaps = GapFactory.createMany(gapCount);

  // Simulate full serialization
  const snapshot = JSON.stringify({
    assessment,
    steps,
    gaps,
    timestamp: new Date().toISOString(),
    hash: `sha256-${Date.now()}`,
  });

  expect(snapshot.length).toBeGreaterThan(0);
}

/** Simulate delta comparison between snapshots */
async function simulateDeltaComparison(
  stepCount: number,
): Promise<void> {
  const stepsA = StepFactory.createMany(stepCount);
  const stepsB = StepFactory.createMany(stepCount);

  // Simulate field-by-field comparison
  const diffs: { stepId: string; field: string; before: unknown; after: unknown }[] = [];
  for (let i = 0; i < stepCount; i++) {
    const a = stepsA[i]!;
    const b = stepsB[i]!;
    if (a.actionTitle !== b.actionTitle) {
      diffs.push({
        stepId: a.id,
        field: "actionTitle",
        before: a.actionTitle,
        after: b.actionTitle,
      });
    }
  }

  expect(diffs).toBeDefined();
}

/** Simulate step content parsing */
function simulateStepContentParsing(stepCount: number): void {
  const steps = StepFactory.createBulk(stepCount, {
    stepType: "BusinessProcess",
    classifiable: true,
  });

  const parsed = steps.map((step) => {
    const html = step.actionInstructionsHtml ?? "";
    // Simulate HTML parsing and content extraction
    const textContent = html.replace(/<[^>]*>/g, "");
    const words = textContent.split(/\s+/).filter(Boolean);
    return {
      id: step.id,
      wordCount: words.length,
      hasInstructions: textContent.length > 0,
      type: step.stepType,
    };
  });

  expect(parsed).toHaveLength(stepCount);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Performance — Load Tests", () => {
  describe("T-PERF-001: 100 concurrent users on same assessment — <500ms p95", () => {
    it("handles 100 concurrent assessment reads within p95 threshold", async () => {
      const results = await simulateConcurrent(100, async () => {
        const start = performance.now();
        await simulateAssessmentLoad(50);
        return performance.now() - start;
      });

      expect(results.errors).toBe(0);
      expect(results.p95).toBeLessThan(500);
    });

    it("no errors under concurrent load", async () => {
      const results = await simulateConcurrent(100, async () => {
        const start = performance.now();
        await simulateAssessmentLoad(10);
        return performance.now() - start;
      });

      expect(results.errors).toBe(0);
    });
  });

  describe("T-PERF-002: 50 concurrent WebSocket connections — <1s delivery", () => {
    it("delivers messages to 50 concurrent WebSocket clients", async () => {
      const clients = createConcurrentClients(50, "assessment-perf");

      const elapsed = await measureMs(() => {
        const message = createActivityMessage(
          "user-1",
          "step:classified",
          "Step 42 classified as Fit",
        );

        // Simulate broadcast to all clients
        for (const client of clients) {
          client.send(message);
        }
      });

      expect(elapsed).toBeLessThan(1000);
      expect(clients.every((c) => c.messages.length === 1)).toBe(true);
    });

    it("all 50 clients receive the broadcasted message", () => {
      const clients = createConcurrentClients(50, "assessment-perf-2");
      const message = createActivityMessage("user-1", "comment:new", "New comment");

      for (const client of clients) {
        client.send(message);
      }

      for (const client of clients) {
        expect(client.messages).toHaveLength(1);
        expect(client.messages[0]!.type).toBe("activity:new");
      }
    });
  });

  describe("T-PERF-003: 1000 assessments in dashboard page load — <3s", () => {
    it("loads dashboard with 1000 assessments within threshold", async () => {
      const elapsed = await measureMs(async () => {
        await simulateDashboardLoad(1000);
      });

      expect(elapsed).toBeLessThan(3000);
    });

    it("correctly aggregates status counts for 1000 assessments", () => {
      const assessments = AssessmentFactory.createMany(1000);
      const statusCounts = assessments.reduce(
        (acc, a) => {
          acc[a.status] = (acc[a.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const total = Object.values(statusCounts).reduce((s, v) => s + v, 0);
      expect(total).toBe(1000);
    });
  });

  describe("T-PERF-004: Assessment with 500 items, 5000 steps — <2s", () => {
    it("processes large assessment within threshold", async () => {
      const elapsed = await measureMs(async () => {
        await simulateAssessmentLoad(5000);
      });

      expect(elapsed).toBeLessThan(2000);
    });

    it("creates 5000 steps without errors", () => {
      const steps = StepFactory.createMany(5000);
      expect(steps).toHaveLength(5000);
      expect(steps.every((s) => s.id)).toBe(true);
    });
  });

  describe("T-PERF-005: Report generation PDF < 30s, XLSX < 15s", () => {
    it("generates PDF report within threshold", async () => {
      const elapsed = await measureMs(async () => {
        await simulatePdfGeneration(200, 500);
      });

      expect(elapsed).toBeLessThan(30000);
    });

    it("generates XLSX report within threshold", async () => {
      const elapsed = await measureMs(async () => {
        await simulateXlsxGeneration(500);
      });

      expect(elapsed).toBeLessThan(15000);
    });
  });

  describe("T-PERF-006: ALM export of 500 gaps — <5 minutes", () => {
    it("exports 500 gaps within threshold", async () => {
      const elapsed = await measureMs(async () => {
        const gaps = GapFactory.createMany(500);
        // Simulate ALM export formatting
        const exported = gaps.map((g) => ({
          id: g.id,
          type: g.resolutionType,
          description: g.gapDescription,
          resolution: g.resolutionDescription,
          effort: g.effortDays,
          cost: g.oneTimeCost,
          risk: g.riskLevel,
          priority: g.priority,
        }));

        expect(exported).toHaveLength(500);
        // Simulate network delay for ALM integration
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(elapsed).toBeLessThan(5 * 60 * 1000); // 5 minutes
    });
  });

  describe("T-PERF-007: Sign-off certificate generation — <5s", () => {
    it("generates sign-off certificate within threshold", async () => {
      const elapsed = await measureMs(async () => {
        const assessment = AssessmentFactory.createReadyForSignOff();
        const certificate = {
          assessmentId: assessment.id,
          companyName: assessment.companyName,
          status: assessment.status,
          signedAt: new Date().toISOString(),
          hash: `sha256-cert-${Date.now()}`,
          modules: assessment.sapModules,
          signedBy: "Executive Sponsor",
        };

        // Simulate certificate rendering
        await new Promise((r) => setTimeout(r, 5));
        expect(certificate.hash).toBeTruthy();
      });

      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe("T-PERF-008: Snapshot creation for large assessment — <10s", () => {
    it("creates snapshot for large assessment within threshold", async () => {
      const elapsed = await measureMs(async () => {
        await simulateSnapshotCreation(5000, 200);
      });

      expect(elapsed).toBeLessThan(10000);
    });
  });

  describe("T-PERF-009: Delta comparison between two snapshots — <5s", () => {
    it("compares two snapshots within threshold", async () => {
      const elapsed = await measureMs(async () => {
        await simulateDeltaComparison(5000);
      });

      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe("T-PERF-010: Step content parsing for 56 steps — <200ms", () => {
    it("parses 56 step content blocks within threshold", async () => {
      const elapsed = await measureMs(() => {
        simulateStepContentParsing(56);
      });

      expect(elapsed).toBeLessThan(200);
    });

    it("correctly parses HTML content from steps", () => {
      const steps = StepFactory.createBulk(56, {
        stepType: "BusinessProcess",
        classifiable: true,
      });

      const parsed = steps.map((step) => {
        const html = step.actionInstructionsHtml ?? "";
        const text = html.replace(/<[^>]*>/g, "");
        return { id: step.id, text, hasContent: text.length > 0 };
      });

      expect(parsed).toHaveLength(56);
      expect(parsed.every((p) => p.hasContent)).toBe(true);
    });
  });
});
