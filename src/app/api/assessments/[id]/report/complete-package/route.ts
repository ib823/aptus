/** GET: Complete Blueprint Package — ZIP of all 16 reports + README (spec v1.2) */

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import archiver from "archiver";
import { authenticateForReport, isErrorResponse, sanitizeFilename } from "@/lib/report/report-auth";
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
  getFindingsDataForReport,
  getTraceabilityDataForReport,
  getSapBestPracticeClassificationData,
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
  requirementsTraceabilitySheet,
  sapBestPracticeClassificationSheets,
} from "@/lib/report/xlsx-generator";
import {
  generateExecutiveSummaryPdf,
  generateEffortEstimatePdf,
  generateReadinessScorecardPdf,
  generateFlowAtlasPdf,
  generateRequirementsFindingsPdf,
  generateSignOffPdf,
  generateSapBestPracticeClassificationPdf,
} from "@/lib/report/pdf-generator";
import { calculateReadinessScorecard, type ReadinessInput } from "@/lib/report/readiness-calculator";
import { loadAssessmentBranding } from "@/lib/report/branding";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  // Load branding (org-level + per-assessment client accent — spec §5.7)
  const branding = await loadAssessmentBranding(assessmentId);

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
    findingsData,
    traceabilityData,
    classificationData,
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
    getFindingsDataForReport(assessmentId),
    getTraceabilityDataForReport(assessmentId),
    getSapBestPracticeClassificationData(assessmentId),
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

  // Generate the first 17 files in parallel (sign-off needs all bytes for hashing)
  const prefix = sanitizeFilename(auth.assessment.companyName);
  const [
    execPdf,
    effortPdf,
    readinessPdf,
    findingsPdf,
    traceabilityXlsx,
    scopeXlsx,
    stepXlsx,
    gapXlsx,
    configXlsx,
    integrationXlsx,
    dmXlsx,
    ocmXlsx,
    flowAtlasPdf,
    auditXlsx,
    remainingXlsx,
    classificationPdf,
    classificationXlsx,
  ] = await Promise.all([
    Promise.resolve(generateExecutiveSummaryPdf(summary, branding)),
    Promise.resolve(generateEffortEstimatePdf(summary, gapData, branding)),
    Promise.resolve(generateReadinessScorecardPdf(auth.assessment.companyName, scorecard, branding)),
    Promise.resolve(generateRequirementsFindingsPdf(findingsData, branding)),
    generateXlsx([requirementsTraceabilitySheet(traceabilityData)]),
    generateXlsx([scopeCatalogSheet(scopeData)]),
    generateXlsx([stepDetailSheet(stepData)]),
    generateXlsx([gapRegisterSheet(gapData)]),
    generateXlsx([configWorkbookSheet(configData)]),
    generateXlsx(integrationRegisterSheets(integrationData)),
    generateXlsx(dataMigrationRegisterSheets(dmData)),
    generateXlsx(ocmReportSheets(ocmData)),
    Promise.resolve(generateFlowAtlasPdf(auth.assessment.companyName, flowDiagrams, branding)),
    generateXlsx([auditTrailSheet(auditData)]),
    generateXlsx([remainingItemsSheet(remainingItems)]),
    Promise.resolve(generateSapBestPracticeClassificationPdf(classificationData, branding)),
    generateXlsx(sapBestPracticeClassificationSheets(classificationData)),
  ]);

  // Compute the bundle hash from the 17 files (everything except sign-off itself).
  // Sign-off PDF embeds this hash so the client can verify the signed bundle
  // wasn't tampered with after they accepted it.
  const hasher = createHash("sha256");
  for (const part of [execPdf, effortPdf, readinessPdf, findingsPdf, traceabilityXlsx,
    scopeXlsx, stepXlsx, gapXlsx, configXlsx, integrationXlsx,
    dmXlsx, ocmXlsx, flowAtlasPdf, auditXlsx, remainingXlsx,
    classificationPdf, classificationXlsx]) {
    hasher.update(part);
  }
  const bundleHash = hasher.digest("hex");

  // Sign-off needs the full assessment metadata (auth.assessment is minimal)
  const fullAssessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    select: {
      companyName: true, industry: true, country: true,
      companySize: true, updatedAt: true,
    },
  });
  const signOffPdf = generateSignOffPdf(
    { assessment: fullAssessment, bundleHash },
    branding,
  );

  // Build README — the v1.2 16-file bundle order matches spec §3 inventory
  const readmeText = [
    `${auth.assessment.companyName} — Complete Blueprint Package`,
    `Generated: ${new Date().toISOString()}`,
    `Bundle hash (SHA-256): ${bundleHash}`,
    "",
    "Read this bundle in order. The first 4 PDFs are for executives; the XLSX",
    "files are for functional and PMO teams; the last PDF is for signature.",
    "",
    "Contents:",
    `  01 Executive Summary             (PDF — 3 pp)`,
    `  02 Effort Estimate               (PDF — 3 pp)`,
    `  03 Readiness Scorecard           (PDF — ~9 pp)`,
    `  04 Requirements Findings         (PDF — every requirement, plain language)`,
    `  05 Requirements Traceability     (XLSX — 1 sheet, 1 row per requirement)`,
    `  06 Scope Catalog                 (XLSX)`,
    `  07 Step Detail                   (XLSX)`,
    `  08 Gap Register                  (XLSX)`,
    `  09 Config Workbook               (XLSX)`,
    `  10 Integration Register          (XLSX — 3 sheets)`,
    `  11 Data Migration Register       (XLSX — 4 sheets)`,
    `  12 OCM Impact Report             (XLSX — 4 sheets)`,
    `  13 Process Flow Atlas            (PDF — landscape, 1 page per process)`,
    `  14 Audit Trail                   (XLSX — every state change with actor + IP)`,
    `  15 Remaining Items Register      (XLSX)`,
    `  16 SAP Best-Practice Classification  (PDF — independent O/C/G verdict per 2602)`,
    `  17 SAP Best-Practice Classification  (XLSX — same data, multi-sheet workbook)`,
    `  18 Sign-Off                      (PDF — two-up signature page + hash)`,
    "",
    "Generated by Aptus Assessment Platform",
  ].join("\n");

  // Stream ZIP response
  const archive = archiver("zip", { zlib: { level: 6 } });
  const chunks: Uint8Array[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));

  archive.append(Buffer.from(readmeText), { name: "README.txt" });
  archive.append(Buffer.from(execPdf),          { name: `01_${prefix}_Executive_Summary.pdf` });
  archive.append(Buffer.from(effortPdf),        { name: `02_${prefix}_Effort_Estimate.pdf` });
  archive.append(Buffer.from(readinessPdf),     { name: `03_${prefix}_Readiness_Scorecard.pdf` });
  archive.append(Buffer.from(findingsPdf),      { name: `04_${prefix}_Requirements_Findings.pdf` });
  archive.append(Buffer.from(traceabilityXlsx), { name: `05_${prefix}_Traceability_Matrix.xlsx` });
  archive.append(Buffer.from(scopeXlsx),        { name: `06_${prefix}_Scope_Catalog.xlsx` });
  archive.append(Buffer.from(stepXlsx),         { name: `07_${prefix}_Step_Detail.xlsx` });
  archive.append(Buffer.from(gapXlsx),          { name: `08_${prefix}_Gap_Register.xlsx` });
  archive.append(Buffer.from(configXlsx),       { name: `09_${prefix}_Config_Workbook.xlsx` });
  archive.append(Buffer.from(integrationXlsx),  { name: `10_${prefix}_Integration_Register.xlsx` });
  archive.append(Buffer.from(dmXlsx),           { name: `11_${prefix}_Data_Migration_Register.xlsx` });
  archive.append(Buffer.from(ocmXlsx),          { name: `12_${prefix}_OCM_Impact_Report.xlsx` });
  archive.append(Buffer.from(flowAtlasPdf),     { name: `13_${prefix}_Process_Flow_Atlas.pdf` });
  archive.append(Buffer.from(auditXlsx),        { name: `14_${prefix}_Audit_Trail.xlsx` });
  archive.append(Buffer.from(remainingXlsx),    { name: `15_${prefix}_Remaining_Items_Register.xlsx` });
  archive.append(Buffer.from(classificationPdf),  { name: `16_${prefix}_SAP_Best_Practice_Classification.pdf` });
  archive.append(Buffer.from(classificationXlsx), { name: `17_${prefix}_SAP_Best_Practice_Classification.xlsx` });
  archive.append(Buffer.from(signOffPdf),       { name: `18_${prefix}_Sign_Off.pdf` });

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
