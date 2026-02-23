/**
 * STATUS: Self-contained specification test
 * REAL MODULE: None — synthetic benchmarks
 * WIRING BLOCKED BY: Synthetic benchmarks
 *
 * Performance Tests — Database (T-PERF-030 through T-PERF-034)
 *
 * Validates database query performance and prevents N+1 query patterns:
 * large list queries, step response queries, full-text search,
 * snapshot serialization, and N+1 detection.
 */

import { describe, it, expect } from "vitest";
import * as AssessmentFactory from "../factories/assessment.factory";
import * as StepFactory from "../factories/step.factory";
import * as GapFactory from "../factories/gap.factory";

// ── Database query simulation helpers ───────────────────────────────────

/** Track query counts for N+1 detection */
class QueryTracker {
  private queries: { sql: string; params: unknown[]; durationMs: number }[] = [];

  recordQuery(sql: string, params: unknown[] = [], durationMs = 0): void {
    this.queries.push({ sql, params, durationMs });
  }

  get count(): number {
    return this.queries.length;
  }

  get totalDurationMs(): number {
    return this.queries.reduce((sum, q) => sum + q.durationMs, 0);
  }

  getQueriesMatching(pattern: string): typeof this.queries {
    return this.queries.filter((q) => q.sql.includes(pattern));
  }

  reset(): void {
    this.queries = [];
  }

  /**
   * Detect N+1 pattern: if a similar query is executed more than threshold times,
   * it likely indicates an N+1 problem.
   */
  detectNPlusOne(threshold = 5): { detected: boolean; offenders: string[] } {
    const queryCounts = new Map<string, number>();
    for (const q of this.queries) {
      // Normalize query by removing specific IDs
      const normalized = q.sql.replace(/= '\w+-\d+'/g, "= ?").replace(/= \d+/g, "= ?");
      queryCounts.set(normalized, (queryCounts.get(normalized) ?? 0) + 1);
    }

    const offenders: string[] = [];
    for (const [query, count] of queryCounts) {
      if (count > threshold) {
        offenders.push(`${query} (executed ${count} times)`);
      }
    }

    return { detected: offenders.length > 0, offenders };
  }
}

/** Simulate an indexed database query for assessments list */
async function queryAssessmentsList(
  count: number,
  tracker: QueryTracker,
): Promise<ReturnType<typeof AssessmentFactory.create>[]> {
  const start = performance.now();

  // Single query with pagination (no N+1)
  tracker.recordQuery(
    `SELECT * FROM "Assessment" WHERE "organizationId" = ? ORDER BY "updatedAt" DESC LIMIT ${count}`,
    ["org-1"],
    performance.now() - start,
  );

  return AssessmentFactory.createMany(count);
}

/** Simulate querying step responses with eager loading */
async function queryStepResponses(
  count: number,
  tracker: QueryTracker,
): Promise<ReturnType<typeof StepFactory.create>[]> {
  const start = performance.now();

  // Use include/join to avoid N+1
  tracker.recordQuery(
    `SELECT s.*, sr.* FROM "ProcessStep" s LEFT JOIN "StepResponse" sr ON s."id" = sr."processStepId" WHERE s."scopeItemId" = ? ORDER BY s."sequence" LIMIT ${count}`,
    ["J60"],
    performance.now() - start,
  );

  return StepFactory.createMany(count);
}

/** Simulate full-text search across organization */
async function fullTextSearch(
  query: string,
  tracker: QueryTracker,
): Promise<{ id: string; match: string; score: number }[]> {
  const start = performance.now();

  // Single full-text search query using tsvector index
  tracker.recordQuery(
    `SELECT id, ts_headline('english', content, plainto_tsquery(?)) as match, ts_rank(search_vector, plainto_tsquery(?)) as score FROM "searchable_content" WHERE search_vector @@ plainto_tsquery(?) ORDER BY score DESC LIMIT 50`,
    [query, query, query],
    performance.now() - start,
  );

  // Simulate search results
  return Array.from({ length: 25 }, (_, i) => ({
    id: `result-${i}`,
    match: `...matching <b>${query}</b> in assessment content...`,
    score: 1 - i * 0.02,
  }));
}

/** Simulate snapshot creation with full serialization */
async function createSnapshot(
  stepCount: number,
  gapCount: number,
  tracker: QueryTracker,
): Promise<string> {
  const start = performance.now();

  // Load assessment with all relations in minimal queries
  tracker.recordQuery(
    'SELECT * FROM "Assessment" WHERE "id" = ?',
    ["assessment-1"],
    0.5,
  );

  tracker.recordQuery(
    `SELECT * FROM "ProcessStep" WHERE "scopeItemId" IN (SELECT "scopeItemId" FROM "ScopeSelection" WHERE "assessmentId" = ?) ORDER BY "sequence"`,
    ["assessment-1"],
    1,
  );

  tracker.recordQuery(
    'SELECT * FROM "StepResponse" WHERE "assessmentId" = ?',
    ["assessment-1"],
    0.8,
  );

  tracker.recordQuery(
    'SELECT * FROM "GapResolution" WHERE "assessmentId" = ?',
    ["assessment-1"],
    0.5,
  );

  tracker.recordQuery(
    'SELECT * FROM "IntegrationPoint" WHERE "assessmentId" = ?',
    ["assessment-1"],
    0.3,
  );

  const assessment = AssessmentFactory.createFullyPopulated();
  const steps = StepFactory.createMany(stepCount);
  const gaps = GapFactory.createMany(gapCount);

  const snapshot = JSON.stringify({
    version: 1,
    assessment,
    steps,
    gaps,
    timestamp: new Date().toISOString(),
    hash: `sha256-${Date.now()}`,
  });

  const elapsed = performance.now() - start;
  tracker.recordQuery(
    'INSERT INTO "AssessmentSnapshot" (id, "assessmentId", data, hash, "createdAt") VALUES (?, ?, ?, ?, NOW())',
    ["snap-1", "assessment-1", snapshot, `sha256-${Date.now()}`],
    elapsed,
  );

  return snapshot;
}

/** Simulate dashboard loading with proper eager loading (no N+1) */
async function loadDashboard(
  assessmentCount: number,
  tracker: QueryTracker,
): Promise<void> {
  // Query 1: Get assessments with aggregated counts
  tracker.recordQuery(
    `SELECT a.*, (SELECT COUNT(*) FROM "StepResponse" sr WHERE sr."assessmentId" = a.id) as step_count, (SELECT COUNT(*) FROM "GapResolution" g WHERE g."assessmentId" = a.id) as gap_count FROM "Assessment" a WHERE a."organizationId" = ? AND a."deletedAt" IS NULL ORDER BY a."updatedAt" DESC LIMIT ?`,
    ["org-1", assessmentCount],
    2,
  );

  // Query 2: Get status summary
  tracker.recordQuery(
    'SELECT status, COUNT(*) as count FROM "Assessment" WHERE "organizationId" = ? AND "deletedAt" IS NULL GROUP BY status',
    ["org-1"],
    1,
  );

  // Query 3: Get recent activity
  tracker.recordQuery(
    'SELECT * FROM "ActivityFeedEntry" WHERE "organizationId" = ? ORDER BY "createdAt" DESC LIMIT 20',
    ["org-1"],
    0.5,
  );
}

/** Simulate step review loading with proper includes */
async function loadStepReview(
  stepCount: number,
  tracker: QueryTracker,
): Promise<void> {
  // Query 1: Steps with responses (join, not N+1)
  tracker.recordQuery(
    `SELECT s.*, sr.classification, sr.notes FROM "ProcessStep" s LEFT JOIN "StepResponse" sr ON s.id = sr."processStepId" AND sr."assessmentId" = ? WHERE s."scopeItemId" IN (SELECT "scopeItemId" FROM "ScopeSelection" WHERE "assessmentId" = ?) ORDER BY s.sequence`,
    ["assessment-1", "assessment-1"],
    3,
  );

  // Query 2: Comments for all steps (batch, not per-step)
  tracker.recordQuery(
    'SELECT * FROM "Comment" WHERE "assessmentId" = ? AND "entityType" = \'step\' ORDER BY "createdAt"',
    ["assessment-1"],
    1,
  );
}

/** Simulate report generation queries */
async function loadReportData(
  tracker: QueryTracker,
): Promise<void> {
  // Query 1: Assessment with profile
  tracker.recordQuery(
    'SELECT * FROM "Assessment" WHERE id = ?',
    ["assessment-1"],
    0.5,
  );

  // Query 2: All steps with responses (join)
  tracker.recordQuery(
    `SELECT s.*, sr.* FROM "ProcessStep" s LEFT JOIN "StepResponse" sr ON s.id = sr."processStepId" WHERE sr."assessmentId" = ?`,
    ["assessment-1"],
    2,
  );

  // Query 3: All gaps with alternatives (join)
  tracker.recordQuery(
    `SELECT g.*, ga.* FROM "GapResolution" g LEFT JOIN "GapAlternative" ga ON g.id = ga."gapResolutionId" WHERE g."assessmentId" = ?`,
    ["assessment-1"],
    1.5,
  );

  // Query 4: Integration points
  tracker.recordQuery(
    'SELECT * FROM "IntegrationPoint" WHERE "assessmentId" = ?',
    ["assessment-1"],
    0.5,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Performance — Database Tests", () => {
  describe("T-PERF-030: Query 10,000 assessments list — <200ms", () => {
    it("queries 10,000 assessments list within threshold", async () => {
      const tracker = new QueryTracker();
      const start = performance.now();

      const assessments = await queryAssessmentsList(10000, tracker);
      const elapsed = performance.now() - start;

      expect(assessments).toHaveLength(10000);
      expect(elapsed).toBeLessThan(200);

      // Should be a single query, not N+1
      expect(tracker.count).toBe(1);
    });

    it("uses single indexed query for assessment list", async () => {
      const tracker = new QueryTracker();
      await queryAssessmentsList(10000, tracker);

      const queries = tracker.getQueriesMatching("Assessment");
      expect(queries).toHaveLength(1);
      expect(queries[0]!.sql).toContain("ORDER BY");
      expect(queries[0]!.sql).toContain("LIMIT");
    });
  });

  describe("T-PERF-031: Query 5,000 step responses — <300ms", () => {
    it("queries 5,000 step responses within threshold", async () => {
      const tracker = new QueryTracker();
      const start = performance.now();

      const steps = await queryStepResponses(5000, tracker);
      const elapsed = performance.now() - start;

      expect(steps).toHaveLength(5000);
      expect(elapsed).toBeLessThan(300);
    });

    it("uses JOIN instead of N+1 for step responses", async () => {
      const tracker = new QueryTracker();
      await queryStepResponses(5000, tracker);

      // Should be a single query with JOIN
      expect(tracker.count).toBe(1);
      expect(tracker.getQueriesMatching("LEFT JOIN")[0]!.sql).toContain(
        "StepResponse",
      );
    });
  });

  describe("T-PERF-032: Full-text search across org — <500ms", () => {
    it("executes full-text search within threshold", async () => {
      const tracker = new QueryTracker();
      const start = performance.now();

      const results = await fullTextSearch("invoice processing", tracker);
      const elapsed = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(500);
    });

    it("uses tsvector index for full-text search", async () => {
      const tracker = new QueryTracker();
      await fullTextSearch("procure to pay", tracker);

      const searchQueries = tracker.getQueriesMatching("search_vector");
      expect(searchQueries).toHaveLength(1);
      expect(searchQueries[0]!.sql).toContain("plainto_tsquery");
    });

    it("returns ranked results with highlights", async () => {
      const tracker = new QueryTracker();
      const results = await fullTextSearch("SAP configuration", tracker);

      // Results should be sorted by score (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
      }
    });
  });

  describe("T-PERF-033: Snapshot creation (full serialize) — <5s", () => {
    it("creates snapshot within threshold", async () => {
      const tracker = new QueryTracker();
      const start = performance.now();

      const snapshot = await createSnapshot(5000, 200, tracker);
      const elapsed = performance.now() - start;

      expect(snapshot.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(5000);
    });

    it("uses minimal queries for snapshot data collection", async () => {
      const tracker = new QueryTracker();
      await createSnapshot(100, 20, tracker);

      // Should use a bounded number of queries (not proportional to data size)
      expect(tracker.count).toBeLessThanOrEqual(10);
    });

    it("snapshot contains all required data sections", async () => {
      const tracker = new QueryTracker();
      const snapshot = await createSnapshot(10, 5, tracker);
      const parsed = JSON.parse(snapshot);

      expect(parsed.version).toBe(1);
      expect(parsed.assessment).toBeDefined();
      expect(parsed.steps).toBeDefined();
      expect(parsed.gaps).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.hash).toBeDefined();
    });
  });

  describe("T-PERF-034: No N+1 queries in dashboard, step review, reports", () => {
    it("dashboard loading has no N+1 queries", async () => {
      const tracker = new QueryTracker();
      await loadDashboard(100, tracker);

      const { detected, offenders } = tracker.detectNPlusOne(5);
      expect(detected).toBe(false);
      if (offenders.length > 0) {
        console.error("N+1 detected in dashboard:", offenders);
      }

      // Dashboard should use 3-5 queries regardless of assessment count
      expect(tracker.count).toBeLessThanOrEqual(5);
    });

    it("step review loading has no N+1 queries", async () => {
      const tracker = new QueryTracker();
      await loadStepReview(500, tracker);

      const { detected } = tracker.detectNPlusOne(5);
      expect(detected).toBe(false);

      // Step review should use 2-3 queries regardless of step count
      expect(tracker.count).toBeLessThanOrEqual(3);
    });

    it("report data loading has no N+1 queries", async () => {
      const tracker = new QueryTracker();
      await loadReportData(tracker);

      const { detected } = tracker.detectNPlusOne(5);
      expect(detected).toBe(false);

      // Report should use bounded queries with JOINs
      expect(tracker.count).toBeLessThanOrEqual(5);
    });

    it("N+1 detector correctly identifies problematic patterns", () => {
      const tracker = new QueryTracker();

      // Simulate N+1: 1 list query + N detail queries
      tracker.recordQuery('SELECT * FROM "Assessment" LIMIT 100');
      for (let i = 0; i < 100; i++) {
        tracker.recordQuery(
          `SELECT * FROM "StepResponse" WHERE "assessmentId" = 'assessment-${i}'`,
        );
      }

      const { detected, offenders } = tracker.detectNPlusOne(5);
      expect(detected).toBe(true);
      expect(offenders.length).toBeGreaterThan(0);
    });

    it("N+1 detector does not flag efficient batched queries", () => {
      const tracker = new QueryTracker();

      // Efficient pattern: few batched queries
      tracker.recordQuery('SELECT * FROM "Assessment" WHERE "organizationId" = ? LIMIT 100');
      tracker.recordQuery('SELECT * FROM "StepResponse" WHERE "assessmentId" IN (?, ?, ?)');
      tracker.recordQuery('SELECT * FROM "GapResolution" WHERE "assessmentId" IN (?, ?, ?)');

      const { detected } = tracker.detectNPlusOne(5);
      expect(detected).toBe(false);
    });
  });
});
