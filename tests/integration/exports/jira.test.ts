/**
 * Integration tests: Jira Export (T-JIRA-001 through T-JIRA-008)
 *
 * Validates the Jira export pipeline: mapping assessment data to Jira
 * issues, handling project configuration, field mapping, batching,
 * error recovery, and export record tracking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as GapFactory from "../../factories/gap.factory";

// ---------------------------------------------------------------------------
// Jira export simulation
// ---------------------------------------------------------------------------

interface JiraExportConfig {
  assessmentId: string;
  jiraProjectKey: string;
  jiraBaseUrl: string;
  issueType: string;
  statusMapping: Record<string, string>;
  priorityMapping: Record<string, string>;
  customFieldMappings?: Record<string, string>;
  labels?: string[];
  batchSize: number;
}

interface JiraIssuePayload {
  project: { key: string };
  summary: string;
  description: string;
  issuetype: { name: string };
  priority: { name: string };
  labels: string[];
  customFields?: Record<string, unknown>;
}

interface JiraExportResult {
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  totalItems: number;
  successCount: number;
  failureCount: number;
  createdIssueKeys: string[];
  errors: { item: string; error: string }[];
  exportRecordId: string;
}

let jiraExportRecords: Map<string, { config: JiraExportConfig; result: JiraExportResult | null; createdAt: Date }>;
let jiraCounter: number;
let issueKeyCounter: number;

function resetJiraStore() {
  jiraExportRecords = new Map();
  jiraCounter = 0;
  issueKeyCounter = 0;
}

function mapGapToJiraIssue(
  gap: ReturnType<typeof GapFactory.create>,
  config: JiraExportConfig,
): JiraIssuePayload {
  const priorityMap = config.priorityMapping;
  const jiraPriority = priorityMap[gap.priority ?? "medium"] ?? "Medium";

  return {
    project: { key: config.jiraProjectKey },
    summary: `[GAP] ${gap.gapDescription.substring(0, 200)}`,
    description: [
      `*Scope Item:* ${gap.scopeItemId}`,
      `*Resolution Type:* ${gap.resolutionType}`,
      `*Resolution:* ${gap.resolutionDescription}`,
      gap.effortDays ? `*Effort:* ${gap.effortDays} days` : "",
      gap.riskLevel ? `*Risk Level:* ${gap.riskLevel}` : "",
      gap.oneTimeCost ? `*One-time Cost:* ${gap.costCurrency} ${gap.oneTimeCost}` : "",
      gap.recurringCost ? `*Recurring Cost:* ${gap.costCurrency} ${gap.recurringCost}/yr` : "",
      gap.rationale ? `*Rationale:* ${gap.rationale}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    issuetype: { name: config.issueType },
    priority: { name: jiraPriority },
    labels: config.labels ?? ["s4hana-assessment"],
    customFields: config.customFieldMappings
      ? {
          [config.customFieldMappings.scopeItem ?? "customfield_10001"]: gap.scopeItemId,
          [config.customFieldMappings.resolutionType ?? "customfield_10002"]: gap.resolutionType,
        }
      : undefined,
  };
}

function validateJiraPayload(
  payload: JiraIssuePayload,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload.project.key || payload.project.key.length === 0) errors.push("Project key required");
  if (!payload.summary || payload.summary.length === 0) errors.push("Summary required");
  if (payload.summary.length > 255) errors.push("Summary exceeds 255 chars");
  if (!payload.issuetype.name) errors.push("Issue type required");
  return { valid: errors.length === 0, errors };
}

function executeJiraExport(
  config: JiraExportConfig,
  gaps: ReturnType<typeof GapFactory.create>[],
  simulateError: "none" | "auth" | "partial" = "none",
): JiraExportResult {
  const recordId = `jira-export-${++jiraCounter}`;

  if (simulateError === "auth") {
    const result: JiraExportResult = {
      status: "FAILED",
      totalItems: gaps.length,
      successCount: 0,
      failureCount: gaps.length,
      createdIssueKeys: [],
      errors: [{ item: "auth", error: "401 Unauthorized: Invalid Jira API token" }],
      exportRecordId: recordId,
    };
    jiraExportRecords.set(recordId, { config, result, createdAt: new Date() });
    return result;
  }

  const issues = gaps.map((gap) => mapGapToJiraIssue(gap, config));
  const createdKeys: string[] = [];
  const errors: { item: string; error: string }[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Process in batches
  for (let batch = 0; batch < issues.length; batch += config.batchSize) {
    const batchIssues = issues.slice(batch, batch + config.batchSize);

    for (let i = 0; i < batchIssues.length; i++) {
      const issue = batchIssues[i]!;
      const globalIdx = batch + i;

      const validation = validateJiraPayload(issue);
      if (!validation.valid) {
        failureCount++;
        errors.push({ item: `gap-${globalIdx}`, error: validation.errors.join("; ") });
        continue;
      }

      if (simulateError === "partial" && globalIdx === 2) {
        failureCount++;
        errors.push({ item: `gap-${globalIdx}`, error: "Jira API 500: Internal Server Error" });
        continue;
      }

      const key = `${config.jiraProjectKey}-${++issueKeyCounter}`;
      createdKeys.push(key);
      successCount++;
    }
  }

  let status: JiraExportResult["status"] = "COMPLETED";
  if (failureCount > 0 && successCount > 0) status = "PARTIAL";
  if (failureCount > 0 && successCount === 0) status = "FAILED";

  const result: JiraExportResult = {
    status,
    totalItems: issues.length,
    successCount,
    failureCount,
    createdIssueKeys: createdKeys,
    errors,
    exportRecordId: recordId,
  };

  jiraExportRecords.set(recordId, { config, result, createdAt: new Date() });
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Jira Export (T-JIRA)", () => {
  const assessmentId = "assess-jira-test";

  const defaultConfig: JiraExportConfig = {
    assessmentId,
    jiraProjectKey: "S4FIT",
    jiraBaseUrl: "https://company.atlassian.net",
    issueType: "Story",
    statusMapping: {
      open: "To Do",
      in_progress: "In Progress",
      resolved: "Done",
    },
    priorityMapping: {
      critical: "Highest",
      high: "High",
      medium: "Medium",
      low: "Low",
    },
    labels: ["s4hana-assessment", "gap-resolution"],
    batchSize: 50,
  };

  beforeEach(() => {
    resetJiraStore();
  });

  it("T-JIRA-001: Gap resolutions map to Jira issue payloads correctly", () => {
    const gap = GapFactory.createResolved({
      assessmentId,
      scopeItemId: "J60",
      gapDescription: "Automated three-way matching not supported in standard",
    });

    const issue = mapGapToJiraIssue(gap, defaultConfig);

    expect(issue.project.key).toBe("S4FIT");
    expect(issue.summary).toContain("[GAP]");
    expect(issue.summary).toContain("Automated three-way matching");
    expect(issue.issuetype.name).toBe("Story");
    expect(issue.priority.name).toBe("Medium");
    expect(issue.labels).toContain("s4hana-assessment");
    expect(issue.description).toContain("Scope Item:* J60");
    expect(issue.description).toContain("Resolution Type:* CONFIGURE");
  });

  it("T-JIRA-002: Priority mapping translates correctly for all levels", () => {
    const priorities = ["critical", "high", "medium", "low"] as const;
    const expected = ["Highest", "High", "Medium", "Low"];

    for (let i = 0; i < priorities.length; i++) {
      const gap = GapFactory.create({
        assessmentId,
        scopeItemId: "J60",
        priority: priorities[i],
      });

      const issue = mapGapToJiraIssue(gap, defaultConfig);
      expect(issue.priority.name).toBe(expected[i]);
    }
  });

  it("T-JIRA-003: Successful bulk export creates issues and returns keys", () => {
    const gaps = GapFactory.createMany(10, {
      assessmentId,
      scopeItemId: "J60",
      priority: "medium",
    });

    const result = executeJiraExport(defaultConfig, gaps);

    expect(result.status).toBe("COMPLETED");
    expect(result.totalItems).toBe(10);
    expect(result.successCount).toBe(10);
    expect(result.failureCount).toBe(0);
    expect(result.createdIssueKeys).toHaveLength(10);
    expect(result.createdIssueKeys[0]).toMatch(/^S4FIT-/);
  });

  it("T-JIRA-004: Authentication failure returns FAILED with auth error", () => {
    const gaps = GapFactory.createMany(3, {
      assessmentId,
      scopeItemId: "J60",
    });

    const result = executeJiraExport(defaultConfig, gaps, "auth");

    expect(result.status).toBe("FAILED");
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(3);
    expect(result.createdIssueKeys).toHaveLength(0);
    expect(result.errors[0]!.error).toContain("401 Unauthorized");
  });

  it("T-JIRA-005: Partial failure creates some issues and reports errors", () => {
    const gaps = GapFactory.createMany(5, {
      assessmentId,
      scopeItemId: "J60",
      priority: "high",
    });

    const result = executeJiraExport(defaultConfig, gaps, "partial");

    expect(result.status).toBe("PARTIAL");
    expect(result.successCount).toBe(4);
    expect(result.failureCount).toBe(1);
    expect(result.createdIssueKeys).toHaveLength(4);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toContain("500");
  });

  it("T-JIRA-006: Batched export processes large sets in configured batch sizes", () => {
    const smallBatchConfig = { ...defaultConfig, batchSize: 3 };
    const gaps = GapFactory.createMany(7, {
      assessmentId,
      scopeItemId: "J60",
      priority: "medium",
    });

    const result = executeJiraExport(smallBatchConfig, gaps);

    // All processed even though batch size is 3
    expect(result.status).toBe("COMPLETED");
    expect(result.totalItems).toBe(7);
    expect(result.successCount).toBe(7);
    expect(result.createdIssueKeys).toHaveLength(7);
  });

  it("T-JIRA-007: Custom field mappings are included in Jira payloads", () => {
    const configWithCustom: JiraExportConfig = {
      ...defaultConfig,
      customFieldMappings: {
        scopeItem: "customfield_20001",
        resolutionType: "customfield_20002",
      },
    };

    const gap = GapFactory.createResolved({
      assessmentId,
      scopeItemId: "J60",
    });

    const issue = mapGapToJiraIssue(gap, configWithCustom);

    expect(issue.customFields).toBeDefined();
    expect(issue.customFields!["customfield_20001"]).toBe("J60");
    expect(issue.customFields!["customfield_20002"]).toBe("CONFIGURE");
  });

  it("T-JIRA-008: Export record is persisted with config and result for audit trail", () => {
    const gaps = GapFactory.createMany(3, {
      assessmentId,
      scopeItemId: "J60",
      priority: "high",
    });

    const result = executeJiraExport(defaultConfig, gaps);

    const record = jiraExportRecords.get(result.exportRecordId)!;
    expect(record).toBeDefined();
    expect(record.config.jiraProjectKey).toBe("S4FIT");
    expect(record.config.assessmentId).toBe(assessmentId);
    expect(record.result).not.toBeNull();
    expect(record.result!.status).toBe("COMPLETED");
    expect(record.result!.totalItems).toBe(3);
    expect(record.createdAt).toBeInstanceOf(Date);
  });
});
