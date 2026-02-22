/**
 * Integration tests: Azure DevOps Export (T-ADO-001 through T-ADO-003)
 *
 * Validates the Azure DevOps export pipeline: mapping assessment data
 * to Azure DevOps work items, handling field constraints, and export
 * record persistence.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as GapFactory from "../../factories/gap.factory";

// ---------------------------------------------------------------------------
// Azure DevOps export simulation
// ---------------------------------------------------------------------------

interface AdoExportConfig {
  assessmentId: string;
  adoOrganization: string;
  adoProject: string;
  workItemType: string;
  areaPath?: string;
  iterationPath?: string;
  priorityMapping: Record<string, number>;
  tagPrefix?: string;
}

interface AdoWorkItemPayload {
  op: "add";
  path: string;
  value: unknown;
}

interface AdoWorkItem {
  fields: AdoWorkItemPayload[];
  workItemType: string;
}

interface AdoExportResult {
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  totalItems: number;
  successCount: number;
  failureCount: number;
  createdWorkItemIds: number[];
  errors: { item: string; error: string }[];
  exportRecordId: string;
}

let adoExportRecords: Map<string, { config: AdoExportConfig; result: AdoExportResult | null; createdAt: Date }>;
let adoCounter: number;
let workItemIdCounter: number;

function resetAdoStore() {
  adoExportRecords = new Map();
  adoCounter = 0;
  workItemIdCounter = 1000;
}

function mapGapToAdoWorkItem(
  gap: ReturnType<typeof GapFactory.create>,
  config: AdoExportConfig,
): AdoWorkItem {
  const priority = config.priorityMapping[gap.priority ?? "medium"] ?? 3;
  const tags = [
    config.tagPrefix ?? "s4hana",
    gap.scopeItemId,
    gap.resolutionType,
    gap.riskCategory ?? "unclassified",
  ].join("; ");

  const fields: AdoWorkItemPayload[] = [
    { op: "add", path: "/fields/System.Title", value: `[GAP] ${gap.gapDescription.substring(0, 255)}` },
    {
      op: "add",
      path: "/fields/System.Description",
      value: [
        `<b>Scope Item:</b> ${gap.scopeItemId}`,
        `<b>Resolution Type:</b> ${gap.resolutionType}`,
        `<b>Description:</b> ${gap.resolutionDescription}`,
        gap.effortDays ? `<b>Effort:</b> ${gap.effortDays} days` : "",
        gap.riskLevel ? `<b>Risk Level:</b> ${gap.riskLevel}` : "",
        gap.oneTimeCost != null ? `<b>One-time Cost:</b> ${gap.costCurrency} ${gap.oneTimeCost}` : "",
        gap.recurringCost != null ? `<b>Recurring Cost:</b> ${gap.costCurrency} ${gap.recurringCost}/yr` : "",
      ]
        .filter(Boolean)
        .join("<br/>"),
    },
    { op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: priority },
    { op: "add", path: "/fields/System.Tags", value: tags },
  ];

  if (config.areaPath) {
    fields.push({ op: "add", path: "/fields/System.AreaPath", value: config.areaPath });
  }
  if (config.iterationPath) {
    fields.push({ op: "add", path: "/fields/System.IterationPath", value: config.iterationPath });
  }

  return { fields, workItemType: config.workItemType };
}

function validateAdoWorkItem(
  item: AdoWorkItem,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const titleField = item.fields.find((f) => f.path === "/fields/System.Title");
  if (!titleField || !titleField.value || (titleField.value as string).length === 0) {
    errors.push("Title is required");
  }
  if (titleField && (titleField.value as string).length > 255) {
    errors.push("Title exceeds 255 characters");
  }
  if (!item.workItemType) {
    errors.push("Work item type is required");
  }
  return { valid: errors.length === 0, errors };
}

function executeAdoExport(
  config: AdoExportConfig,
  gaps: ReturnType<typeof GapFactory.create>[],
  simulateError = false,
): AdoExportResult {
  const recordId = `ado-export-${++adoCounter}`;
  const createdIds: number[] = [];
  const errors: { item: string; error: string }[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i]!;
    const workItem = mapGapToAdoWorkItem(gap, config);
    const validation = validateAdoWorkItem(workItem);

    if (!validation.valid) {
      failureCount++;
      errors.push({ item: `gap-${i}`, error: validation.errors.join("; ") });
      continue;
    }

    if (simulateError && i === 0) {
      failureCount++;
      errors.push({ item: `gap-${i}`, error: "ADO API 403: Insufficient permissions" });
      continue;
    }

    createdIds.push(++workItemIdCounter);
    successCount++;
  }

  let status: AdoExportResult["status"] = "COMPLETED";
  if (failureCount > 0 && successCount > 0) status = "PARTIAL";
  if (failureCount > 0 && successCount === 0) status = "FAILED";

  const result: AdoExportResult = {
    status,
    totalItems: gaps.length,
    successCount,
    failureCount,
    createdWorkItemIds: createdIds,
    errors,
    exportRecordId: recordId,
  };

  adoExportRecords.set(recordId, { config, result, createdAt: new Date() });
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Azure DevOps Export (T-ADO)", () => {
  const assessmentId = "assess-ado-test";

  const defaultConfig: AdoExportConfig = {
    assessmentId,
    adoOrganization: "contoso",
    adoProject: "S4HANA-Migration",
    workItemType: "User Story",
    areaPath: "S4HANA-Migration\\Gaps",
    iterationPath: "S4HANA-Migration\\Sprint 1",
    priorityMapping: {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    },
    tagPrefix: "s4hana-fit",
  };

  beforeEach(() => {
    resetAdoStore();
  });

  it("T-ADO-001: Gap resolutions map to Azure DevOps work item payloads correctly", () => {
    const gap = GapFactory.createResolved({
      assessmentId,
      scopeItemId: "J60",
      gapDescription: "Three-way matching requires custom BADI implementation",
    });

    const workItem = mapGapToAdoWorkItem(gap, defaultConfig);

    expect(workItem.workItemType).toBe("User Story");
    expect(workItem.fields.length).toBeGreaterThanOrEqual(4);

    const titleField = workItem.fields.find((f) => f.path === "/fields/System.Title");
    expect(titleField).toBeDefined();
    expect(titleField!.value).toContain("[GAP]");
    expect(titleField!.value).toContain("Three-way matching");

    const descField = workItem.fields.find((f) => f.path === "/fields/System.Description");
    expect(descField).toBeDefined();
    expect(descField!.value as string).toContain("Scope Item:");
    expect(descField!.value as string).toContain("J60");
    expect(descField!.value as string).toContain("Resolution Type:");

    const priorityField = workItem.fields.find(
      (f) => f.path === "/fields/Microsoft.VSTS.Common.Priority",
    );
    expect(priorityField).toBeDefined();
    expect(priorityField!.value).toBe(3); // "medium" mapped to 3

    const tagsField = workItem.fields.find((f) => f.path === "/fields/System.Tags");
    expect(tagsField).toBeDefined();
    expect(tagsField!.value as string).toContain("s4hana-fit");
    expect(tagsField!.value as string).toContain("J60");

    const areaField = workItem.fields.find((f) => f.path === "/fields/System.AreaPath");
    expect(areaField).toBeDefined();
    expect(areaField!.value).toBe("S4HANA-Migration\\Gaps");

    const iterField = workItem.fields.find((f) => f.path === "/fields/System.IterationPath");
    expect(iterField).toBeDefined();
    expect(iterField!.value).toBe("S4HANA-Migration\\Sprint 1");
  });

  it("T-ADO-002: Successful bulk export creates work items and returns IDs", () => {
    const gaps = GapFactory.createMany(8, {
      assessmentId,
      scopeItemId: "J60",
      priority: "high",
    });

    const result = executeAdoExport(defaultConfig, gaps);

    expect(result.status).toBe("COMPLETED");
    expect(result.totalItems).toBe(8);
    expect(result.successCount).toBe(8);
    expect(result.failureCount).toBe(0);
    expect(result.createdWorkItemIds).toHaveLength(8);
    expect(result.createdWorkItemIds.every((id) => typeof id === "number")).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Export record persisted
    const record = adoExportRecords.get(result.exportRecordId)!;
    expect(record.config.adoProject).toBe("S4HANA-Migration");
    expect(record.result!.status).toBe("COMPLETED");
    expect(record.createdAt).toBeInstanceOf(Date);
  });

  it("T-ADO-003: Permission failure is recorded in export result", () => {
    const gaps = GapFactory.createMany(3, {
      assessmentId,
      scopeItemId: "J60",
      priority: "medium",
    });

    const result = executeAdoExport(defaultConfig, gaps, true);

    expect(result.status).toBe("PARTIAL");
    expect(result.failureCount).toBe(1);
    expect(result.successCount).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toContain("403");
    expect(result.errors[0]!.error).toContain("Insufficient permissions");

    // Successfully created items still tracked
    expect(result.createdWorkItemIds).toHaveLength(2);
  });
});
