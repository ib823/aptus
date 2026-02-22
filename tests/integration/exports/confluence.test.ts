/**
 * Integration tests: Confluence Export (T-CONF-EXP-001 through T-CONF-EXP-002)
 *
 * Validates the Confluence export pipeline: mapping assessment data
 * to Confluence page structures and handling export record tracking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as AssessmentFactory from "../../factories/assessment.factory";
import * as GapFactory from "../../factories/gap.factory";

// ---------------------------------------------------------------------------
// Confluence export simulation
// ---------------------------------------------------------------------------

interface ConfluenceExportConfig {
  assessmentId: string;
  spaceKey: string;
  parentPageId: string;
  baseUrl: string;
  includeExecutiveSummary: boolean;
  includeGapRegister: boolean;
  includeIntegrationRegister: boolean;
  includeDataMigrationRegister: boolean;
  includeOcmRegister: boolean;
}

interface ConfluencePagePayload {
  type: "page";
  title: string;
  space: { key: string };
  ancestors: [{ id: string }];
  body: {
    storage: {
      value: string;
      representation: "storage";
    };
  };
}

interface ConfluenceExportResult {
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  totalPages: number;
  successCount: number;
  failureCount: number;
  createdPageIds: string[];
  errors: { page: string; error: string }[];
  exportRecordId: string;
}

let confluenceRecords: Map<string, { config: ConfluenceExportConfig; result: ConfluenceExportResult | null; createdAt: Date }>;
let confluenceCounter: number;
let pageIdCounter: number;

function resetConfluenceStore() {
  confluenceRecords = new Map();
  confluenceCounter = 0;
  pageIdCounter = 5000;
}

function buildExecutiveSummaryPage(
  assessment: ReturnType<typeof AssessmentFactory.create>,
  gaps: ReturnType<typeof GapFactory.create>[],
  config: ConfluenceExportConfig,
): ConfluencePagePayload {
  const totalGaps = gaps.length;
  const resolvedGaps = gaps.filter((g) => g.decidedBy !== null).length;
  const highRiskGaps = gaps.filter((g) => g.riskLevel === "HIGH").length;
  const totalCost = gaps.reduce((sum, g) => sum + (g.oneTimeCost ?? 0), 0);

  const html = [
    `<h1>Executive Summary: ${assessment.companyName}</h1>`,
    `<table>`,
    `<tr><th>Company</th><td>${assessment.companyName}</td></tr>`,
    `<tr><th>Industry</th><td>${assessment.industry}</td></tr>`,
    `<tr><th>Country</th><td>${assessment.country}</td></tr>`,
    `<tr><th>Company Size</th><td>${assessment.companySize}</td></tr>`,
    `<tr><th>Status</th><td>${assessment.status}</td></tr>`,
    `<tr><th>SAP Version</th><td>${assessment.sapVersion}</td></tr>`,
    `</table>`,
    `<h2>Gap Summary</h2>`,
    `<ul>`,
    `<li>Total Gaps: ${totalGaps}</li>`,
    `<li>Resolved: ${resolvedGaps}</li>`,
    `<li>High Risk: ${highRiskGaps}</li>`,
    `<li>Total One-time Cost: ${assessment.currencyCode ?? "USD"} ${totalCost.toLocaleString()}</li>`,
    `</ul>`,
  ].join("\n");

  return {
    type: "page",
    title: `${assessment.companyName} - Executive Summary`,
    space: { key: config.spaceKey },
    ancestors: [{ id: config.parentPageId }],
    body: { storage: { value: html, representation: "storage" } },
  };
}

function buildGapRegisterPage(
  assessment: ReturnType<typeof AssessmentFactory.create>,
  gaps: ReturnType<typeof GapFactory.create>[],
  config: ConfluenceExportConfig,
): ConfluencePagePayload {
  const rows = gaps
    .map(
      (g) =>
        `<tr>` +
        `<td>${g.scopeItemId}</td>` +
        `<td>${g.gapDescription.substring(0, 100)}</td>` +
        `<td>${g.resolutionType}</td>` +
        `<td>${g.priority ?? "-"}</td>` +
        `<td>${g.riskLevel ?? "-"}</td>` +
        `<td>${g.oneTimeCost ?? "-"}</td>` +
        `<td>${g.effortDays ?? "-"}</td>` +
        `</tr>`,
    )
    .join("\n");

  const html = [
    `<h1>Gap Register: ${assessment.companyName}</h1>`,
    `<table>`,
    `<tr><th>Scope Item</th><th>Description</th><th>Resolution</th><th>Priority</th><th>Risk</th><th>Cost</th><th>Effort</th></tr>`,
    rows,
    `</table>`,
  ].join("\n");

  return {
    type: "page",
    title: `${assessment.companyName} - Gap Register`,
    space: { key: config.spaceKey },
    ancestors: [{ id: config.parentPageId }],
    body: { storage: { value: html, representation: "storage" } },
  };
}

function executeConfluenceExport(
  config: ConfluenceExportConfig,
  assessment: ReturnType<typeof AssessmentFactory.create>,
  gaps: ReturnType<typeof GapFactory.create>[],
  simulateError = false,
): ConfluenceExportResult {
  const recordId = `confluence-export-${++confluenceCounter}`;
  const pages: ConfluencePagePayload[] = [];
  const createdPageIds: string[] = [];
  const errors: { page: string; error: string }[] = [];
  let successCount = 0;
  let failureCount = 0;

  if (config.includeExecutiveSummary) {
    pages.push(buildExecutiveSummaryPage(assessment, gaps, config));
  }
  if (config.includeGapRegister) {
    pages.push(buildGapRegisterPage(assessment, gaps, config));
  }

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;

    if (simulateError && i === 0) {
      failureCount++;
      errors.push({ page: page.title, error: "Confluence API 403: Space permission denied" });
      continue;
    }

    createdPageIds.push(String(++pageIdCounter));
    successCount++;
  }

  let status: ConfluenceExportResult["status"] = "COMPLETED";
  if (failureCount > 0 && successCount > 0) status = "PARTIAL";
  if (failureCount > 0 && successCount === 0) status = "FAILED";

  const result: ConfluenceExportResult = {
    status,
    totalPages: pages.length,
    successCount,
    failureCount,
    createdPageIds,
    errors,
    exportRecordId: recordId,
  };

  confluenceRecords.set(recordId, { config, result, createdAt: new Date() });
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Confluence Export (T-CONF-EXP)", () => {
  const assessmentId = "assess-confluence-test";

  const defaultConfig: ConfluenceExportConfig = {
    assessmentId,
    spaceKey: "S4PROJ",
    parentPageId: "12345",
    baseUrl: "https://company.atlassian.net/wiki",
    includeExecutiveSummary: true,
    includeGapRegister: true,
    includeIntegrationRegister: false,
    includeDataMigrationRegister: false,
    includeOcmRegister: false,
  };

  beforeEach(() => {
    resetConfluenceStore();
  });

  it("T-CONF-EXP-001: Assessment data maps to Confluence pages with correct structure", () => {
    const assessment = AssessmentFactory.createFullyPopulated({
      id: assessmentId,
      organizationId: "org-1",
    });

    const gaps = [
      GapFactory.createResolved({
        assessmentId,
        scopeItemId: "J60",
        gapDescription: "Custom pricing not available in standard",
        riskLevel: "HIGH",
        oneTimeCost: 50000,
        priority: "critical",
      }),
      GapFactory.createResolved({
        assessmentId,
        scopeItemId: "J14",
        gapDescription: "Reporting requires additional analytics",
        riskLevel: "LOW",
        oneTimeCost: 10000,
        priority: "low",
      }),
    ];

    // Test executive summary page
    const summaryPage = buildExecutiveSummaryPage(assessment, gaps, defaultConfig);

    expect(summaryPage.type).toBe("page");
    expect(summaryPage.title).toContain(assessment.companyName);
    expect(summaryPage.title).toContain("Executive Summary");
    expect(summaryPage.space.key).toBe("S4PROJ");
    expect(summaryPage.ancestors[0].id).toBe("12345");
    expect(summaryPage.body.storage.representation).toBe("storage");

    const content = summaryPage.body.storage.value;
    expect(content).toContain(assessment.companyName);
    expect(content).toContain(assessment.industry);
    expect(content).toContain("Total Gaps: 2");
    expect(content).toContain("High Risk: 1");

    // Test gap register page
    const gapPage = buildGapRegisterPage(assessment, gaps, defaultConfig);

    expect(gapPage.title).toContain("Gap Register");
    const gapContent = gapPage.body.storage.value;
    expect(gapContent).toContain("J60");
    expect(gapContent).toContain("J14");
    expect(gapContent).toContain("Custom pricing");

    // Full export
    const result = executeConfluenceExport(defaultConfig, assessment, gaps);

    expect(result.status).toBe("COMPLETED");
    expect(result.totalPages).toBe(2); // summary + gap register
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.createdPageIds).toHaveLength(2);

    // Export record persisted
    const record = confluenceRecords.get(result.exportRecordId)!;
    expect(record.config.spaceKey).toBe("S4PROJ");
    expect(record.result!.status).toBe("COMPLETED");
    expect(record.createdAt).toBeInstanceOf(Date);
  });

  it("T-CONF-EXP-002: Permission failure on first page results in PARTIAL export", () => {
    const assessment = AssessmentFactory.createFullyPopulated({
      id: assessmentId,
      organizationId: "org-1",
    });

    const gaps = GapFactory.createMany(3, {
      assessmentId,
      scopeItemId: "J60",
      priority: "medium",
    });

    const result = executeConfluenceExport(defaultConfig, assessment, gaps, true);

    expect(result.status).toBe("PARTIAL");
    expect(result.totalPages).toBe(2);
    expect(result.successCount).toBe(1); // Gap register succeeded
    expect(result.failureCount).toBe(1); // Executive summary failed
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toContain("403");
    expect(result.errors[0]!.error).toContain("Space permission denied");

    // One page was still created
    expect(result.createdPageIds).toHaveLength(1);

    // Export record captures partial result
    const record = confluenceRecords.get(result.exportRecordId)!;
    expect(record.result!.status).toBe("PARTIAL");
    expect(record.result!.failureCount).toBe(1);
  });
});
