/**
 * STATUS: Self-contained specification test
 * REAL MODULE: src/lib/signoff/ (ALM exports)
 * WIRING BLOCKED BY: Need database layer
 *
 * Integration tests: Cloud ALM Export (T-ALM-001 through T-ALM-010)
 *
 * Validates the SAP Cloud ALM export pipeline: mapping assessment data
 * to ALM structures, handling field constraints, retry logic, partial
 * success, and export record persistence.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockSession, createMockUser } from "../../helpers/auth";
import * as AssessmentFactory from "../../factories/assessment.factory";
import * as GapFactory from "../../factories/gap.factory";
import * as StepFactory from "../../factories/step.factory";

// ---------------------------------------------------------------------------
// Cloud ALM export simulation
// ---------------------------------------------------------------------------

interface AlmExportConfig {
  assessmentId: string;
  projectId: string;
  connectionId: string;
  includeScope: boolean;
  includeGaps: boolean;
  includeIntegrations: boolean;
  includeDataMigration: boolean;
  includeOcm: boolean;
  taskAssignee?: string;
}

interface AlmTaskPayload {
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  scopeItemId?: string;
  assignee?: string;
}

interface AlmExportResult {
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  totalItems: number;
  successCount: number;
  failureCount: number;
  errors: { item: string; error: string }[];
  exportRecordId: string;
}

interface AlmExportRecord {
  id: string;
  assessmentId: string;
  targetSystem: string;
  status: string;
  exportedById: string;
  exportConfig: AlmExportConfig;
  resultSummary: AlmExportResult | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

let exportRecords: Map<string, AlmExportRecord>;
let exportCounter: number;

function resetExportStore() {
  exportRecords = new Map();
  exportCounter = 0;
}

function mapGapToAlmTask(
  gap: ReturnType<typeof GapFactory.create>,
  config: AlmExportConfig,
): AlmTaskPayload {
  return {
    title: `GAP: ${gap.gapDescription.substring(0, 100)}`,
    description: [
      `Resolution: ${gap.resolutionType}`,
      `Description: ${gap.resolutionDescription}`,
      gap.effortDays ? `Effort: ${gap.effortDays} days` : null,
      gap.riskLevel ? `Risk: ${gap.riskLevel}` : null,
      gap.oneTimeCost ? `One-time cost: ${gap.costCurrency} ${gap.oneTimeCost}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    type: "requirement",
    priority: gap.priority ?? "medium",
    status: "open",
    scopeItemId: gap.scopeItemId,
    ...(config.taskAssignee != null ? { assignee: config.taskAssignee } : {}),
  };
}

function validateAlmPayload(
  payload: AlmTaskPayload,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload.title || payload.title.length === 0) errors.push("Title is required");
  if (payload.title.length > 255) errors.push("Title exceeds 255 characters");
  if (!payload.type) errors.push("Type is required");
  if (!["requirement", "task", "defect", "user_story"].includes(payload.type)) {
    errors.push(`Invalid type: ${payload.type}`);
  }
  if (!["critical", "high", "medium", "low"].includes(payload.priority)) {
    errors.push(`Invalid priority: ${payload.priority}`);
  }
  return { valid: errors.length === 0, errors };
}

function executeAlmExport(
  config: AlmExportConfig,
  gaps: ReturnType<typeof GapFactory.create>[],
  exporterId: string,
  simulatePartialFailure = false,
): AlmExportResult {
  const recordId = `alm-export-${++exportCounter}`;
  const now = new Date();

  const record: AlmExportRecord = {
    id: recordId,
    assessmentId: config.assessmentId,
    targetSystem: "SAP_CLOUD_ALM",
    status: "IN_PROGRESS",
    exportedById: exporterId,
    exportConfig: config,
    resultSummary: null,
    errorMessage: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
  };
  exportRecords.set(recordId, record);

  const tasks = gaps.map((gap) => mapGapToAlmTask(gap, config));
  let successCount = 0;
  let failureCount = 0;
  const errors: { item: string; error: string }[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    const validation = validateAlmPayload(task);

    if (!validation.valid) {
      failureCount++;
      errors.push({ item: `gap-${i}`, error: validation.errors.join("; ") });
      continue;
    }

    if (simulatePartialFailure && i === Math.floor(tasks.length / 2)) {
      failureCount++;
      errors.push({ item: `gap-${i}`, error: "ALM API timeout" });
      continue;
    }

    successCount++;
  }

  let status: AlmExportResult["status"] = "COMPLETED";
  if (failureCount > 0 && successCount > 0) status = "PARTIAL";
  if (failureCount > 0 && successCount === 0) status = "FAILED";

  const result: AlmExportResult = {
    status,
    totalItems: tasks.length,
    successCount,
    failureCount,
    errors,
    exportRecordId: recordId,
  };

  record.status = status;
  record.resultSummary = result;
  record.completedAt = new Date();

  return result;
}

function retryFailedItems(
  exportRecordId: string,
  gaps: ReturnType<typeof GapFactory.create>[],
): AlmExportResult | null {
  const record = exportRecords.get(exportRecordId);
  if (!record || !record.resultSummary) return null;

  const failedIndices = record.resultSummary.errors.map((e) => {
    const match = e.item.match(/gap-(\d+)/);
    return match ? parseInt(match[1]!, 10) : -1;
  });

  const failedGaps = failedIndices
    .filter((i) => i >= 0 && i < gaps.length)
    .map((i) => gaps[i]!);

  if (failedGaps.length === 0) return null;

  const retryResult = executeAlmExport(
    record.exportConfig,
    failedGaps,
    record.exportedById,
    false, // no simulated failure on retry
  );

  return retryResult;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Cloud ALM Export (T-ALM)", () => {
  const assessmentId = "assess-alm-test";

  beforeEach(() => {
    resetExportStore();
  });

  it("T-ALM-001: Gap resolutions are mapped to ALM task payloads correctly", () => {
    const gap = GapFactory.createResolved({
      assessmentId,
      scopeItemId: "J60",
      gapDescription: "Custom pricing logic for multi-level discounts",
    });

    const config: AlmExportConfig = {
      assessmentId,
      projectId: "alm-proj-1",
      connectionId: "conn-1",
      includeScope: true,
      includeGaps: true,
      includeIntegrations: false,
      includeDataMigration: false,
      includeOcm: false,
      taskAssignee: "consultant@example.com",
    };

    const task = mapGapToAlmTask(gap, config);

    expect(task.title).toContain("GAP:");
    expect(task.title).toContain("Custom pricing logic");
    expect(task.description).toContain("Resolution: CONFIGURE");
    expect(task.type).toBe("requirement");
    expect(task.priority).toBe("medium");
    expect(task.status).toBe("open");
    expect(task.scopeItemId).toBe("J60");
    expect(task.assignee).toBe("consultant@example.com");
  });

  it("T-ALM-002: ALM payload validation catches invalid fields", () => {
    const invalidPayload: AlmTaskPayload = {
      title: "",
      description: "desc",
      type: "invalid_type",
      priority: "urgent", // invalid
      status: "open",
    };

    const validation = validateAlmPayload(invalidPayload);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("Title is required");
    expect(validation.errors.some((e) => e.includes("Invalid type"))).toBe(true);
    expect(validation.errors.some((e) => e.includes("Invalid priority"))).toBe(true);
  });

  it("T-ALM-003: Successful export creates an export record with COMPLETED status", () => {
    const gaps = GapFactory.createMany(5, {
      assessmentId,
      scopeItemId: "J60",
      priority: "high",
    });

    const config: AlmExportConfig = {
      assessmentId,
      projectId: "alm-proj-1",
      connectionId: "conn-1",
      includeScope: false,
      includeGaps: true,
      includeIntegrations: false,
      includeDataMigration: false,
      includeOcm: false,
    };

    const result = executeAlmExport(config, gaps, "user-exporter");

    expect(result.status).toBe("COMPLETED");
    expect(result.totalItems).toBe(5);
    expect(result.successCount).toBe(5);
    expect(result.failureCount).toBe(0);
    expect(result.errors).toHaveLength(0);

    const record = exportRecords.get(result.exportRecordId)!;
    expect(record.targetSystem).toBe("SAP_CLOUD_ALM");
    expect(record.status).toBe("COMPLETED");
    expect(record.completedAt).toBeInstanceOf(Date);
  });

  it("T-ALM-004: Partial failure results in PARTIAL status with error details", () => {
    const gaps = GapFactory.createMany(6, {
      assessmentId,
      scopeItemId: "J60",
      priority: "medium",
    });

    const config: AlmExportConfig = {
      assessmentId,
      projectId: "alm-proj-1",
      connectionId: "conn-1",
      includeScope: false,
      includeGaps: true,
      includeIntegrations: false,
      includeDataMigration: false,
      includeOcm: false,
    };

    const result = executeAlmExport(config, gaps, "user-exporter", true);

    expect(result.status).toBe("PARTIAL");
    expect(result.successCount).toBeGreaterThan(0);
    expect(result.failureCount).toBeGreaterThan(0);
    expect(result.successCount + result.failureCount).toBe(result.totalItems);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.error).toContain("ALM API timeout");
  });

  it("T-ALM-005: Failed items can be retried independently", () => {
    const gaps = GapFactory.createMany(4, {
      assessmentId,
      scopeItemId: "J60",
      priority: "high",
    });

    const config: AlmExportConfig = {
      assessmentId,
      projectId: "alm-proj-1",
      connectionId: "conn-1",
      includeScope: false,
      includeGaps: true,
      includeIntegrations: false,
      includeDataMigration: false,
      includeOcm: false,
    };

    const initialResult = executeAlmExport(config, gaps, "user-exporter", true);
    expect(initialResult.status).toBe("PARTIAL");

    // Retry only failed items
    const retryResult = retryFailedItems(initialResult.exportRecordId, gaps);
    expect(retryResult).not.toBeNull();
    expect(retryResult!.status).toBe("COMPLETED");
    expect(retryResult!.failureCount).toBe(0);
  });

  it("T-ALM-006: Export with no gaps produces COMPLETED with zero items", () => {
    const config: AlmExportConfig = {
      assessmentId,
      projectId: "alm-proj-1",
      connectionId: "conn-1",
      includeScope: false,
      includeGaps: true,
      includeIntegrations: false,
      includeDataMigration: false,
      includeOcm: false,
    };

    const result = executeAlmExport(config, [], "user-exporter");

    expect(result.status).toBe("COMPLETED");
    expect(result.totalItems).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(0);
  });

  it("T-ALM-007: High-risk gaps are mapped with correct priority", () => {
    const highRiskGap = GapFactory.createHighRisk({
      assessmentId,
      scopeItemId: "J60",
    });

    const config: AlmExportConfig = {
      assessmentId,
      projectId: "alm-proj-1",
      connectionId: "conn-1",
      includeScope: false,
      includeGaps: true,
      includeIntegrations: false,
      includeDataMigration: false,
      includeOcm: false,
    };

    const task = mapGapToAlmTask(highRiskGap, config);

    expect(task.priority).toBe("critical");
    expect(task.description).toContain("Risk: HIGH");
    expect(task.description).toContain("Effort: 30 days");
  });

  it("T-ALM-008: Export record captures full config and summary for audit", () => {
    const gaps = GapFactory.createMany(3, {
      assessmentId,
      scopeItemId: "J60",
      priority: "medium",
    });

    const config: AlmExportConfig = {
      assessmentId,
      projectId: "alm-proj-1",
      connectionId: "conn-1",
      includeScope: true,
      includeGaps: true,
      includeIntegrations: true,
      includeDataMigration: false,
      includeOcm: false,
      taskAssignee: "lead@example.com",
    };

    const result = executeAlmExport(config, gaps, "user-auditor");

    const record = exportRecords.get(result.exportRecordId)!;

    // Config fully persisted
    expect(record.exportConfig.projectId).toBe("alm-proj-1");
    expect(record.exportConfig.includeScope).toBe(true);
    expect(record.exportConfig.includeGaps).toBe(true);
    expect(record.exportConfig.taskAssignee).toBe("lead@example.com");

    // Result summary persisted
    expect(record.resultSummary).not.toBeNull();
    expect(record.resultSummary!.totalItems).toBe(3);

    // Timestamps for audit
    expect(record.startedAt).toBeInstanceOf(Date);
    expect(record.completedAt).toBeInstanceOf(Date);
    expect(record.exportedById).toBe("user-auditor");
  });

  it("T-ALM-009: Title truncation for very long gap descriptions", () => {
    const longGap = GapFactory.create({
      assessmentId,
      scopeItemId: "J60",
      gapDescription: "A".repeat(300), // Very long description
      priority: "low",
    });

    const config: AlmExportConfig = {
      assessmentId,
      projectId: "alm-proj-1",
      connectionId: "conn-1",
      includeScope: false,
      includeGaps: true,
      includeIntegrations: false,
      includeDataMigration: false,
      includeOcm: false,
    };

    const task = mapGapToAlmTask(longGap, config);

    // Title is GAP: + first 100 chars
    expect(task.title.length).toBeLessThanOrEqual(105); // "GAP: " + 100 chars
    const validation = validateAlmPayload(task);
    expect(validation.valid).toBe(true);
  });

  it("T-ALM-010: Multiple exports for the same assessment create separate records", () => {
    const gaps = GapFactory.createMany(2, {
      assessmentId,
      scopeItemId: "J60",
      priority: "medium",
    });

    const config: AlmExportConfig = {
      assessmentId,
      projectId: "alm-proj-1",
      connectionId: "conn-1",
      includeScope: false,
      includeGaps: true,
      includeIntegrations: false,
      includeDataMigration: false,
      includeOcm: false,
    };

    const result1 = executeAlmExport(config, gaps, "user-1");
    const result2 = executeAlmExport(config, gaps, "user-2");

    expect(result1.exportRecordId).not.toBe(result2.exportRecordId);

    const records = Array.from(exportRecords.values()).filter(
      (r) => r.assessmentId === assessmentId,
    );
    expect(records).toHaveLength(2);
    expect(records[0]!.exportedById).not.toBe(records[1]!.exportedById);
  });
});
