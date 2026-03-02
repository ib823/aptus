/** GET: Complete Blueprint Package — ZIP of all 13 reports + README */

import { NextResponse, type NextRequest } from "next/server";
import archiver from "archiver";
import { authenticateForReport, isErrorResponse } from "@/lib/report/report-auth";
import {
  getReportSummary,
  getScopeDataForReport,
  getStepDataForReport,
  getGapDataForReport,
  getConfigDataForReport,
  getAuditTrailForReport,
  getIntegrationDataForReport,
  getDataMigrationDataForReport,
  getOcmDataForReport,
} from "@/lib/report/report-data";
import {
  generateXlsx,
  scopeCatalogSheet,
  stepDetailSheet,
  gapRegisterSheet,
  configWorkbookSheet,
  auditTrailSheet,
  integrationRegisterSheets,
  dataMigrationRegisterSheets,
  ocmReportSheets,
  remainingItemsSheet,
} from "@/lib/report/xlsx-generator";
import {
  generateExecutiveSummaryPdf,
  generateEffortEstimatePdf,
  generateReadinessScorecardPdf,
  generateFlowAtlasPdf,
} from "@/lib/report/pdf-generator";
import { calculateReadinessScorecard, type ReadinessInput } from "@/lib/report/readiness-calculator";
import { loadBranding } from "@/lib/report/branding";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  // Load branding for PDF generation
  const branding = await loadBranding(auth.assessment.organizationId);

  // Load all data in parallel
  const [
    summary,
    scopeData,
    stepData,
    gapData,
    configData,
    auditData,
    integrationData,
    dmData,
    ocmData,
    flowDiagrams,
    remainingItems,
  ] = await Promise.all([
    getReportSummary(assessmentId),
    getScopeDataForReport(assessmentId),
    getStepDataForReport(assessmentId),
    getGapDataForReport(assessmentId),
    getConfigDataForReport(assessmentId),
    getAuditTrailForReport(assessmentId),
    getIntegrationDataForReport(assessmentId),
    getDataMigrationDataForReport(assessmentId),
    getOcmDataForReport(assessmentId),
    loadFlowDiagramData(assessmentId),
    loadRemainingItemsData(assessmentId),
  ]);

  // Generate readiness scorecard data
  const [intCount, dmCount, ocmCount, stakeholderCount, signOffCount] = await Promise.all([
    prisma.integrationPoint.count({ where: { assessmentId } }),
    prisma.dataMigrationObject.count({ where: { assessmentId } }),
    prisma.ocmImpact.count({ where: { assessmentId } }),
    prisma.assessmentStakeholder.count({ where: { assessmentId } }),
    prisma.assessmentSignOff.count({ where: { assessmentId } }),
  ]);

  const analyzedInt = await prisma.integrationPoint.count({
    where: { assessmentId, status: { not: "identified" } },
  });
  const readyDm = await prisma.dataMigrationObject.count({
    where: { assessmentId, status: { in: ["validated", "migrated", "completed"] } },
  });
  const mitigatedOcm = await prisma.ocmImpact.count({
    where: { assessmentId, status: { in: ["mitigated", "accepted", "completed"] } },
  });
  const activeStakeholders = await prisma.assessmentStakeholder.count({
    where: { assessmentId, role: { not: "observer" } },
  });
  const completedSignOffs = await prisma.assessmentSignOff.count({
    where: { assessmentId },
  });

  const readinessInput: ReadinessInput = {
    totalScopeItems: summary.scope.total,
    decidedScopeItems: summary.scope.selected + (summary.scope.total - summary.scope.selected - summary.scope.maybe),
    totalSteps: summary.steps.total,
    reviewedSteps: summary.steps.reviewed,
    totalGaps: summary.gaps.total,
    resolvedGaps: summary.gaps.resolved,
    totalIntegrations: intCount,
    analyzedIntegrations: analyzedInt,
    totalDmObjects: dmCount,
    readyDmObjects: readyDm,
    totalOcmImpacts: ocmCount,
    mitigatedOcmImpacts: mitigatedOcm,
    totalStakeholders: stakeholderCount,
    activeStakeholders,
    totalSignOffs: signOffCount,
    completedSignOffs,
  };

  const scorecard = calculateReadinessScorecard(readinessInput);

  // Generate all 13 report files in parallel
  const prefix = auth.assessment.companyName.replace(/[^a-zA-Z0-9]/g, "_");
  const [
    execPdf,
    effortPdf,
    readinessPdf,
    flowAtlasPdf,
    scopeXlsx,
    stepXlsx,
    gapXlsx,
    configXlsx,
    auditXlsx,
    integrationXlsx,
    dmXlsx,
    ocmXlsx,
    remainingXlsx,
  ] = await Promise.all([
    Promise.resolve(generateExecutiveSummaryPdf(summary, branding)),
    Promise.resolve(generateEffortEstimatePdf(summary, gapData, branding)),
    Promise.resolve(generateReadinessScorecardPdf(auth.assessment.companyName, scorecard, branding)),
    Promise.resolve(generateFlowAtlasPdf(auth.assessment.companyName, flowDiagrams, branding)),
    generateXlsx([scopeCatalogSheet(scopeData)]),
    generateXlsx([stepDetailSheet(stepData)]),
    generateXlsx([gapRegisterSheet(gapData)]),
    generateXlsx([configWorkbookSheet(configData)]),
    generateXlsx([auditTrailSheet(auditData)]),
    generateXlsx(integrationRegisterSheets(integrationData)),
    generateXlsx(dataMigrationRegisterSheets(dmData)),
    generateXlsx(ocmReportSheets(ocmData)),
    generateXlsx([remainingItemsSheet(remainingItems)]),
  ]);

  // Build README
  const readmeText = [
    `${auth.assessment.companyName} — Complete Blueprint Package`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "Contents:",
    `  01 Executive Summary (PDF)`,
    `  02 Effort Estimate (PDF)`,
    `  03 Readiness Scorecard (PDF)`,
    `  04 Process Flow Atlas (PDF)`,
    `  05 Scope Catalog (XLSX)`,
    `  06 Step Detail (XLSX)`,
    `  07 Gap Register (XLSX)`,
    `  08 Config Workbook (XLSX)`,
    `  09 Audit Trail (XLSX)`,
    `  10 Integration Register (XLSX — 3 sheets)`,
    `  11 Data Migration Register (XLSX — 4 sheets)`,
    `  12 OCM Impact Report (XLSX — 4 sheets)`,
    `  13 Remaining Items Register (XLSX)`,
    "",
    "Generated by ABeam Assessment Platform",
  ].join("\n");

  // Stream ZIP response
  const archive = archiver("zip", { zlib: { level: 6 } });
  const chunks: Uint8Array[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));

  archive.append(Buffer.from(readmeText), { name: "README.txt" });
  archive.append(Buffer.from(execPdf), { name: `01_${prefix}_Executive_Summary.pdf` });
  archive.append(Buffer.from(effortPdf), { name: `02_${prefix}_Effort_Estimate.pdf` });
  archive.append(Buffer.from(readinessPdf), { name: `03_${prefix}_Readiness_Scorecard.pdf` });
  archive.append(Buffer.from(flowAtlasPdf), { name: `04_${prefix}_Process_Flow_Atlas.pdf` });
  archive.append(Buffer.from(scopeXlsx), { name: `05_${prefix}_Scope_Catalog.xlsx` });
  archive.append(Buffer.from(stepXlsx), { name: `06_${prefix}_Step_Detail.xlsx` });
  archive.append(Buffer.from(gapXlsx), { name: `07_${prefix}_Gap_Register.xlsx` });
  archive.append(Buffer.from(configXlsx), { name: `08_${prefix}_Config_Workbook.xlsx` });
  archive.append(Buffer.from(auditXlsx), { name: `09_${prefix}_Audit_Trail.xlsx` });
  archive.append(Buffer.from(integrationXlsx), { name: `10_${prefix}_Integration_Register.xlsx` });
  archive.append(Buffer.from(dmXlsx), { name: `11_${prefix}_Data_Migration_Register.xlsx` });
  archive.append(Buffer.from(ocmXlsx), { name: `12_${prefix}_OCM_Impact_Report.xlsx` });
  archive.append(Buffer.from(remainingXlsx), { name: `13_${prefix}_Remaining_Items_Register.xlsx` });

  await archive.finalize();

  const zipBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${prefix}_Complete_Blueprint_Package.zip"`,
    },
  });
}

async function loadFlowDiagramData(assessmentId: string) {
  const diagrams = await prisma.processFlowDiagram.findMany({
    where: { assessmentId },
    select: {
      scopeItemId: true,
      processFlowName: true,
      stepCount: true,
      fitCount: true,
      configureCount: true,
      gapCount: true,
      naCount: true,
      pendingCount: true,
    },
    orderBy: [{ scopeItemId: "asc" }, { processFlowName: "asc" }],
  });

  const scopeItemIds = [...new Set(diagrams.map((d) => d.scopeItemId))];
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: scopeItemIds } },
    select: { id: true, nameClean: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s.nameClean]));

  return diagrams.map((d) => ({
    scopeItemId: d.scopeItemId,
    scopeItemName: scopeMap.get(d.scopeItemId) ?? d.scopeItemId,
    processFlowName: d.processFlowName,
    stepCount: d.stepCount,
    fitCount: d.fitCount,
    configureCount: d.configureCount,
    gapCount: d.gapCount,
    naCount: d.naCount,
    pendingCount: d.pendingCount,
  }));
}

async function loadRemainingItemsData(assessmentId: string) {
  const items = await prisma.remainingItem.findMany({
    where: { assessmentId },
    orderBy: [{ severity: "asc" }, { category: "asc" }],
  });

  return items.map((item, i) => ({
    itemNumber: i + 1,
    category: item.category,
    title: item.title,
    description: item.description,
    severity: item.severity,
    sourceEntity: item.sourceEntityType ? `${item.sourceEntityType}:${item.sourceEntityId}` : "",
    scopeItemId: item.scopeItemId ?? "",
    functionalArea: item.functionalArea ?? "",
    assignedTo: item.assignedTo ?? "",
    resolution: item.resolution ?? "",
    resolvedAt: item.resolvedAt?.toISOString() ?? "",
    resolvedBy: item.resolvedBy ?? "",
    autoGenerated: item.autoGenerated ? "Yes" : "No",
  }));
}
