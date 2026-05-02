/** Report data aggregation — queries all assessment data for report generation */

import { prisma } from "@/lib/db/prisma";

export async function getReportSummary(assessmentId: string) {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    select: {
      id: true,
      companyName: true,
      industry: true,
      country: true,
      companySize: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Scope stats
  const scopeSelections = await prisma.scopeSelection.findMany({
    where: { assessmentId },
    select: { scopeItemId: true, selected: true, relevance: true },
  });
  const selectedScopeIds = scopeSelections
    .filter((s) => s.selected)
    .map((s) => s.scopeItemId);
  const totalScopeItems = scopeSelections.length;
  const selectedScopeItems = selectedScopeIds.length;
  const maybeScopeItems = scopeSelections.filter((s) => s.relevance === "MAYBE").length;

  // Step response stats. For AI-driven assessments where the workflow writes
  // ClassificationVerdict directly (1,564 verdicts, no StepResponse rows),
  // we fall back to the verdict bucket distribution so the verdict block in
  // Executive Summary reflects the actual classification work — instead of
  // rendering "0% Standard / 0% Configurable / 0% Needs work".
  const stepResponses = await prisma.stepResponse.findMany({
    where: { assessmentId },
    select: { fitStatus: true },
  });
  let totalStepsReviewed = stepResponses.length;
  let fitCount = stepResponses.filter((s) => s.fitStatus === "FIT").length;
  let configureCount = stepResponses.filter((s) => s.fitStatus === "CONFIGURE").length;
  let gapCount = stepResponses.filter((s) => s.fitStatus === "GAP").length;
  let naCount = stepResponses.filter((s) => s.fitStatus === "NA").length;

  // Total process steps for selected scope
  const totalProcessSteps = await prisma.processStep.count({
    where: { scopeItemId: { in: selectedScopeIds } },
  });

  // Fallback: when no StepResponse exists, use ClassificationVerdict via
  // ClientRequirement.solutionProviderResponse as the proxy for "reviewed".
  let effectiveTotalSteps = totalProcessSteps;
  if (totalStepsReviewed === 0) {
    const reqs = await prisma.clientRequirement.findMany({
      where: { assessmentId },
      select: { solutionProviderResponse: true },
    });
    if (reqs.length > 0) {
      for (const r of reqs) {
        const b = bucketOf(r.solutionProviderResponse);
        if (b === "O") fitCount++;
        else if (b === "C") configureCount++;
        else if (b === "G") gapCount++;
        else if (b === "NA") naCount++;
      }
      totalStepsReviewed = fitCount + configureCount + gapCount + naCount;
      // For AI-driven assessments, the analytical universe is ClientRequirement,
      // not the catalog's full ProcessStep set. Use the requirement count as
      // the denominator so fitPercent reads "% of analysed requirements that
      // are FIT/CONFIGURE" — not "% of catalog ProcessSteps reviewed AND fit".
      effectiveTotalSteps = reqs.length;
    }
  }

  const pendingSteps = Math.max(0, effectiveTotalSteps - totalStepsReviewed);
  const fitPercent = effectiveTotalSteps > 0
    ? Math.round(((fitCount + configureCount) / effectiveTotalSteps) * 100)
    : 0;

  // Gap stats
  const gaps = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: { resolutionType: true, effortDays: true },
  });
  const totalGaps = gaps.length;
  const totalEffortDays = gaps.reduce((sum, g) => sum + (g.effortDays ?? 0), 0);
  const resolvedGaps = gaps.filter((g) => g.resolutionType !== "PENDING").length;

  // Gap breakdown by resolution type
  const gapsByType: Record<string, number> = {};
  for (const g of gaps) {
    gapsByType[g.resolutionType] = (gapsByType[g.resolutionType] ?? 0) + 1;
  }

  // Config stats
  const configActivities = await prisma.configActivity.count({
    where: { scopeItemId: { in: selectedScopeIds } },
  });

  return {
    assessment,
    scope: {
      total: totalScopeItems,
      selected: selectedScopeItems,
      maybe: maybeScopeItems,
    },
    steps: {
      total: effectiveTotalSteps,
      reviewed: totalStepsReviewed,
      pending: pendingSteps,
      fit: fitCount,
      configure: configureCount,
      gap: gapCount,
      na: naCount,
      fitPercent,
    },
    gaps: {
      total: totalGaps,
      resolved: resolvedGaps,
      pending: totalGaps - resolvedGaps,
      totalEffortDays,
      byType: gapsByType,
    },
    config: {
      total: configActivities,
    },
  };
}

export async function getScopeDataForReport(assessmentId: string) {
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId },
    select: {
      scopeItemId: true,
      selected: true,
      relevance: true,
      currentState: true,
      notes: true,
      granularity: true,
      assessmentVerdict: true,
    },
  });
  const scopeItemIds = selections.map((s) => s.scopeItemId);
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: scopeItemIds } },
    select: {
      id: true,
      nameClean: true,
      functionalArea: true,
      subArea: true,
      totalSteps: true,
    },
  });

  const configCounts = await prisma.configActivity.groupBy({
    by: ["scopeItemId"],
    where: { scopeItemId: { in: scopeItemIds } },
    _count: { id: true },
  });
  const configCountMap = new Map(configCounts.map((c) => [c.scopeItemId, c._count.id]));

  const scopeMap = new Map(scopeItems.map((s) => [s.id, s]));

  const verdictLabels: Record<string, string> = {
    mostly_fit: "Mostly FIT",
    mostly_config: "Mostly Configuration",
    has_gaps: "Has Gaps",
    needs_workshop: "Needs Workshop",
  };
  const granularityLabels: Record<string, string> = {
    coarse: "Coarse",
    medium: "Medium",
    fine: "Fine",
  };

  return selections.map((sel) => {
    const item = scopeMap.get(sel.scopeItemId);
    return {
      scopeItemId: sel.scopeItemId,
      name: item?.nameClean ?? sel.scopeItemId,
      functionalArea: item?.functionalArea ?? "",
      subArea: item?.subArea ?? "",
      selected: sel.selected ? "Yes" : "No",
      relevance: sel.relevance,
      granularity: granularityLabels[sel.granularity] ?? sel.granularity,
      verdict: sel.assessmentVerdict ? verdictLabels[sel.assessmentVerdict] ?? sel.assessmentVerdict : "",
      currentState: sel.currentState ?? "",
      notes: sel.notes ?? "",
      totalSteps: item?.totalSteps ?? 0,
      configCount: configCountMap.get(sel.scopeItemId) ?? 0,
    };
  });
}

export async function getStepDataForReport(assessmentId: string) {
  const responses = await prisma.stepResponse.findMany({
    where: { assessmentId },
    include: {
      processStep: {
        select: {
          id: true,
          scopeItemId: true,
          solutionProcessName: true,
          solutionProcessFlowName: true,
          activityTitle: true,
          sequence: true,
          actionTitle: true,
          stepType: true,
        },
      },
    },
    orderBy: { processStep: { sequence: "asc" } },
  });

  const scopeItemIds = [...new Set(responses.map((r) => r.processStep.scopeItemId))];
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: scopeItemIds } },
    select: { id: true, nameClean: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s.nameClean]));

  return responses.map((r) => ({
    scopeItemId: r.processStep.scopeItemId,
    scopeItemName: scopeMap.get(r.processStep.scopeItemId) ?? r.processStep.scopeItemId,
    solutionProcess: r.processStep.solutionProcessName ?? "",
    processFlow: r.processStep.solutionProcessFlowName ?? "",
    activityTitle: r.processStep.activityTitle ?? "",
    stepSequence: r.processStep.sequence,
    actionTitle: r.processStep.actionTitle,
    stepType: r.processStep.stepType,
    fitStatus: r.fitStatus,
    clientNote: r.clientNote ?? "",
    currentProcess: r.currentProcess ?? "",
    respondent: r.respondent ?? "",
    respondedAt: r.respondedAt?.toISOString() ?? "",
  }));
}

export async function getGapDataForReport(assessmentId: string) {
  const gaps = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: {
      id: true,
      scopeItemId: true,
      processStepId: true,
      gapDescription: true,
      resolutionType: true,
      resolutionDescription: true,
      effortDays: true,
      costEstimate: true,
      riskLevel: true,
      upgradeImpact: true,
      decidedBy: true,
      decidedAt: true,
      clientApproved: true,
      rationale: true,
    },
    orderBy: { scopeItemId: "asc" },
  });

  return gaps.map((g) => {
    const cost = g.costEstimate as Record<string, unknown> | null;
    return {
      gapId: g.id,
      scopeItem: g.scopeItemId,
      processStep: g.processStepId,
      gapDescription: g.gapDescription,
      resolutionType: g.resolutionType,
      resolutionDescription: g.resolutionDescription,
      effortDays: g.effortDays ?? 0,
      oneTimeCost: typeof cost?.["oneTime"] === "number" ? cost["oneTime"] : 0,
      recurringCost: typeof cost?.["recurring"] === "number" ? cost["recurring"] : 0,
      riskLevel: g.riskLevel ?? "",
      upgradeImpact: g.upgradeImpact ?? "",
      decidedBy: g.decidedBy ?? "",
      decidedAt: g.decidedAt?.toISOString() ?? "",
      clientApproved: g.clientApproved ? "Yes" : "No",
      rationale: g.rationale ?? "",
    };
  });
}

export async function getConfigDataForReport(assessmentId: string) {
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });
  const selectedIds = selections.map((s) => s.scopeItemId);

  const configs = await prisma.configActivity.findMany({
    where: { scopeItemId: { in: selectedIds } },
    select: {
      id: true,
      scopeItemId: true,
      applicationArea: true,
      applicationSubarea: true,
      configItemName: true,
      configItemId: true,
      activityDescription: true,
      selfService: true,
      configApproach: true,
      category: true,
      activityId: true,
    },
    orderBy: [{ category: "asc" }, { configItemName: "asc" }],
  });

  // Get scope item names
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: selectedIds } },
    select: { id: true, nameClean: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s.nameClean]));

  // Get config selections
  const configIds = configs.map((c) => c.id);
  const configSelections = await prisma.configSelection.findMany({
    where: { assessmentId, configActivityId: { in: configIds } },
    select: { configActivityId: true, included: true },
  });
  const selectionMap = new Map(configSelections.map((s) => [s.configActivityId, s.included]));

  return configs.map((c) => {
    const defaultIncluded = c.category !== "Optional";
    const included = selectionMap.get(c.id) ?? defaultIncluded;
    return {
      scopeItemId: c.scopeItemId,
      scopeItemName: scopeMap.get(c.scopeItemId) ?? c.scopeItemId,
      applicationArea: c.applicationArea,
      applicationSubarea: c.applicationSubarea,
      configItemName: c.configItemName,
      configItemId: c.configItemId,
      activityDescription: c.activityDescription,
      selfService: c.selfService ? "Yes" : "No",
      configApproach: c.configApproach ?? "",
      category: c.category,
      activityId: c.activityId,
      included: included ? "Yes" : "No",
    };
  });
}

export async function getIntegrationDataForReport(assessmentId: string) {
  const items = await prisma.integrationPoint.findMany({
    where: { assessmentId },
    orderBy: [{ direction: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      direction: true,
      sourceSystem: true,
      targetSystem: true,
      interfaceType: true,
      frequency: true,
      middleware: true,
      dataVolume: true,
      complexity: true,
      priority: true,
      status: true,
      estimatedEffortDays: true,
      functionalArea: true,
      technicalNotes: true,
    },
  });

  return items.map((i) => ({
    integrationId: i.id,
    name: i.name,
    description: i.description,
    direction: i.direction,
    sourceSystem: i.sourceSystem,
    targetSystem: i.targetSystem,
    interfaceType: i.interfaceType,
    frequency: i.frequency,
    middleware: i.middleware ?? "",
    dataVolume: i.dataVolume ?? "",
    complexity: i.complexity ?? "",
    priority: i.priority ?? "",
    status: i.status,
    effortDays: i.estimatedEffortDays ?? 0,
    functionalArea: i.functionalArea ?? "",
    technicalNotes: i.technicalNotes ?? "",
  }));
}

export async function getDataMigrationDataForReport(assessmentId: string) {
  const items = await prisma.dataMigrationObject.findMany({
    where: { assessmentId },
    orderBy: [{ objectType: "asc" }, { objectName: "asc" }],
    select: {
      id: true,
      objectName: true,
      description: true,
      objectType: true,
      sourceSystem: true,
      sourceFormat: true,
      volumeEstimate: true,
      recordCount: true,
      cleansingRequired: true,
      cleansingNotes: true,
      mappingComplexity: true,
      migrationApproach: true,
      migrationTool: true,
      priority: true,
      status: true,
      estimatedEffortDays: true,
      functionalArea: true,
    },
  });

  return items.map((i) => ({
    objectId: i.id,
    objectName: i.objectName,
    description: i.description,
    objectType: i.objectType,
    sourceSystem: i.sourceSystem,
    sourceFormat: i.sourceFormat ?? "",
    volumeEstimate: i.volumeEstimate ?? "",
    recordCount: i.recordCount ?? 0,
    cleansingRequired: i.cleansingRequired ? "Yes" : "No",
    cleansingNotes: i.cleansingNotes ?? "",
    mappingComplexity: i.mappingComplexity ?? "",
    migrationApproach: i.migrationApproach ?? "",
    migrationTool: i.migrationTool ?? "",
    priority: i.priority ?? "",
    status: i.status,
    effortDays: i.estimatedEffortDays ?? 0,
    functionalArea: i.functionalArea ?? "",
  }));
}

export async function getOcmDataForReport(assessmentId: string) {
  const items = await prisma.ocmImpact.findMany({
    where: { assessmentId },
    orderBy: [{ severity: "asc" }, { changeType: "asc" }],
    select: {
      id: true,
      impactTitle: true,
      impactedRole: true,
      impactedDepartment: true,
      functionalArea: true,
      changeType: true,
      severity: true,
      description: true,
      trainingRequired: true,
      trainingType: true,
      trainingDuration: true,
      resistanceRisk: true,
      readinessScore: true,
      mitigationStrategy: true,
      affectedUserCount: true,
      priority: true,
      status: true,
    },
  });

  return items.map((i) => ({
    impactId: i.id,
    title: i.impactTitle ?? "",
    impactedRole: i.impactedRole,
    department: i.impactedDepartment ?? "",
    functionalArea: i.functionalArea ?? "",
    changeType: i.changeType,
    severity: i.severity,
    description: i.description,
    trainingRequired: i.trainingRequired ? "Yes" : "No",
    trainingType: i.trainingType ?? "",
    trainingDuration: i.trainingDuration ?? 0,
    resistanceRisk: i.resistanceRisk ?? "",
    readinessScore: i.readinessScore != null ? `${Math.round(i.readinessScore * 100)}%` : "",
    mitigationStrategy: i.mitigationStrategy ?? "",
    affectedUsers: i.affectedUserCount ?? 0,
    priority: i.priority ?? "",
    status: i.status,
  }));
}

export async function getAuditTrailForReport(assessmentId: string) {
  const entries = await prisma.decisionLogEntry.findMany({
    where: { assessmentId },
    orderBy: { timestamp: "asc" },
    select: {
      timestamp: true,
      actor: true,
      actorRole: true,
      entityType: true,
      entityId: true,
      action: true,
      oldValue: true,
      newValue: true,
      reason: true,
    },
  });

  return entries.map((e) => ({
    timestamp: e.timestamp.toISOString(),
    actor: e.actor,
    actorRole: e.actorRole,
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    oldValue: JSON.stringify(e.oldValue),
    newValue: JSON.stringify(e.newValue),
    reason: e.reason ?? "",
  }));
}

// ── NEW (Phase F): Findings + Traceability data prep ─────────────────────────

import { outcomeMeans } from "@/lib/report/glossary";
import type { ResolutionType } from "@/types/assessment";
import type { FindingsData } from "@/lib/report/pdf-generator";
import type { TraceabilityRow } from "@/lib/report/xlsx-generator";

/** Map a free-text resolution-type string from data to a canonical
 * ResolutionType. Falls back to FIT (the most common, "no work needed"). */
function normalizeResolutionType(raw: string | null | undefined): ResolutionType {
  if (!raw) return "FIT";
  const upper = raw.toUpperCase().replace(/[\s-]/g, "_");
  const VALID: ReadonlySet<string> = new Set([
    "FIT", "CONFIGURE", "ADAPT_PROCESS", "ISV", "KEY_USER_EXT", "BTP_EXT", "CUSTOM_ABAP", "OUT_OF_SCOPE",
  ]);
  return (VALID.has(upper) ? upper : "FIT") as ResolutionType;
}

/** Map an O/C/G/NA classification bucket to the canonical ResolutionType
 * used by the Findings + Traceability reports. The bucket comes from the
 * AI/manual classifier (ClassificationVerdict, surfaced via
 * ClientRequirement.solutionProviderResponse). */
function bucketToResolutionType(bucket: ClassificationBucket): ResolutionType {
  switch (bucket) {
    case "O": return "FIT";
    case "C": return "CONFIGURE";
    case "G": return "CUSTOM_ABAP"; // generic gap; refined per-row via GapResolution if available
    case "NA": return "OUT_OF_SCOPE";
    case "Pending": return "FIT"; // safest default for un-classified rows
  }
}

/** Resolve a single requirement's outcome. Prefers a GapResolution refinement
 * (which carries analyst-decided detail like ISV / KEY_USER_EXT / BTP_EXT)
 * when one exists for the requirement's scope item; otherwise falls back to
 * the classification bucket on solutionProviderResponse. */
function deriveRowOutcome(
  classification: string | null | undefined,
  gapTypeForScopeItem: string | null | undefined,
): ResolutionType {
  const fromBucket = bucketToResolutionType(bucketOf(classification));
  // Only override with a GapResolution refinement when the row is actually a gap
  // (bucket=G). Otherwise the analyst's gap-typed answer doesn't apply.
  if (fromBucket === "CUSTOM_ABAP" && gapTypeForScopeItem) {
    const refined = normalizeResolutionType(gapTypeForScopeItem);
    if (refined !== "FIT") return refined;
  }
  return fromBucket;
}

/** Build a per-scope-item map of GapResolution.resolutionType, used to refine
 * the row outcome when a row's bucket is G. Multiple gaps for the same scope
 * item: prefer the most recently-decided one. */
async function buildGapTypeByScopeItem(assessmentId: string): Promise<Map<string, string>> {
  const gaps = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: { scopeItemId: true, resolutionType: true, decidedAt: true },
    orderBy: { decidedAt: "desc" },
  });
  const result = new Map<string, string>();
  for (const g of gaps) {
    if (!result.has(g.scopeItemId)) result.set(g.scopeItemId, g.resolutionType);
  }
  return result;
}

/** Build the shape consumed by generateRequirementsFindingsPdf.
 * Aggregates ClientRequirements by module (= functional area), enriches each
 * area with a per-area outcome distribution from GapResolution, and picks
 * up to 4 sample requirement cards per area. */
export async function getFindingsDataForReport(assessmentId: string): Promise<FindingsData> {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    select: {
      companyName: true,
      industry: true,
      country: true,
      companySize: true,
      updatedAt: true,
    },
  });

  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId },
    select: {
      module: true,
      code: true,
      requirementText: true,
      requirementType: true,
      solutionProviderResponse: true,
      scopeItemIds: true,
      sortOrder: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });

  const gapTypeByScopeItem = await buildGapTypeByScopeItem(assessmentId);

  // Compute each requirement's actual outcome from its classification bucket.
  // This is the load-bearing change: 489 Configuration verdicts no longer
  // collapse into FIT just because no GapResolution row mentions them.
  const reqOutcomes = reqs.map((r) => {
    const firstScopeItemId = r.scopeItemIds?.split(",")[0]?.trim();
    const gapType = firstScopeItemId ? gapTypeByScopeItem.get(firstScopeItemId) : null;
    return { req: r, outcome: deriveRowOutcome(r.solutionProviderResponse, gapType) };
  });

  // Group requirements by module
  const byModule = new Map<string, typeof reqOutcomes>();
  for (const ro of reqOutcomes) {
    const key = ro.req.module || "Unassigned";
    const list = byModule.get(key) ?? [];
    list.push(ro);
    byModule.set(key, list);
  }

  // Build totals across all rows from each row's actual outcome
  const totalsByOutcome: Partial<Record<ResolutionType, number>> = {};
  for (const { outcome } of reqOutcomes) {
    totalsByOutcome[outcome] = (totalsByOutcome[outcome] ?? 0) + 1;
  }
  const totalReqs = reqs.length;

  // Build per-area summaries with sample cards. Each card carries its OWN
  // outcome (not the area's dominant one) so a Configuration verdict in a
  // mostly-FIT area still shows the correct pill.
  const byArea = [...byModule.entries()].map(([area, areaRows]) => {
    const dist: Partial<Record<ResolutionType, number>> = {};
    for (const { outcome } of areaRows) {
      dist[outcome] = (dist[outcome] ?? 0) + 1;
    }

    return {
      area,
      total: areaRows.length,
      byOutcome: dist,
      cards: areaRows.slice(0, 4).map(({ req: r, outcome }) => ({
        reqId: r.code,
        yourAsk: r.requirementText,
        whatSapDoes: r.solutionProviderResponse?.trim() || outcomeMeans(outcome),
        resolutionType: outcome,
      })),
    };
  });

  return {
    assessment: {
      companyName: assessment.companyName,
      industry: assessment.industry,
      country: assessment.country,
      companySize: assessment.companySize,
      updatedAt: assessment.updatedAt,
    },
    totals: { total: totalReqs, byOutcome: totalsByOutcome },
    byArea,
  };
}

/** Build the shape consumed by requirementsTraceabilitySheet.
 * One row per ClientRequirement with derived outcome from each row's actual
 * ClassificationVerdict bucket (refined by GapResolution where available). */
export async function getTraceabilityDataForReport(assessmentId: string): Promise<TraceabilityRow[]> {
  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId },
    select: {
      code: true,
      module: true,
      section: true,
      requirementText: true,
      requirementType: true,
      solutionProviderResponse: true,
      scopeItemIds: true,
      sortOrder: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });

  const gapTypeByScopeItem = await buildGapTypeByScopeItem(assessmentId);

  return reqs.map((r) => {
    const firstScopeItemId = r.scopeItemIds?.split(",")[0]?.trim();
    const gapType = firstScopeItemId ? gapTypeByScopeItem.get(firstScopeItemId) : null;
    const outcome = deriveRowOutcome(r.solutionProviderResponse, gapType);
    return {
      reqId: r.code,
      sourceFile: `${r.module}.xlsx`,
      sourceRow: r.sortOrder,
      functionalArea: r.module,
      subArea: r.section ?? "—",
      process: r.module,
      mustHave: r.requirementType?.toLowerCase().includes("mandatory") ?? false,
      yourAsk: r.requirementText,
      outcome,
      whatItMeans: r.solutionProviderResponse?.trim() || outcomeMeans(outcome),
      effortDays: 0,
      owner: "—",
      notes: "",
    };
  });
}

// ---------------------------------------------------------------------------
// SAP Best-Practice Classification report
//
// Reads the analyzer's independent verdict directly from
// `ClientRequirement.solutionProviderResponse` (and accompanying Remarks +
// erpModuleSupporting columns). Does NOT consult `GapResolution` or
// `StepResponse` — the existing 16 reports already aggregate those for
// analyst-output deliverables. This accessor stays separate so the two
// classification streams (independent SAP-2602 verdict vs. analyst review)
// never get mixed up in a single chart.
// ---------------------------------------------------------------------------

export type ClassificationBucket = "O" | "C" | "G" | "NA" | "Pending";

export interface ClassificationRow {
  /** Aptus assessment ID for the requirement (cuid). */
  id: string;
  /** Vendor sheet/section the requirement was imported from. */
  module: string;
  /** Vendor row code (e.g. "C.AAT.I16", "M1", "A.BR.4"). */
  code: string;
  /** "mandatory" | "business" | "technical" | "functional" | "checklist". */
  requirementClass: string;
  /** "Mandatory" | "Non-Mandatory" | null. */
  requirementType: string | null;
  /** The vendor's requirement text (read-only — what they asked for). */
  requirementText: string;
  /** Aptus's independent classification, e.g. "O - Out Of The Box". */
  classification: string;
  /** Aptus's grounded narrative explaining the verdict. */
  remarks: string;
  /** Comma-separated 2602 scope item IDs + names that satisfy this — legacy
   * combined view. Kept for back-compat with older rows. */
  scopeItems: string;
  /** Structured columns added 2026-04-27. Null on rows classified before that
   * cutover; populated by classify-batch apply when the result file provides
   * sapModule / scopeItemIds / scopeItemNames. */
  sapModule: string;
  scopeItemIds: string;
  scopeItemNames: string;
  /** Bucket — derived from `classification` for grouping. */
  bucket: ClassificationBucket;
}

export interface ClassificationModuleBreakdown {
  module: string;
  total: number;
  O: number;
  C: number;
  G: number;
  NA: number;
  Pending: number;
}

export interface SapBestPracticeClassificationData {
  assessment: {
    companyName: string;
    industry: string;
    country: string;
    updatedAt: Date;
    /** SAP catalog edition the assessment is pinned to: "PUBLIC" | "PRIVATE" |
     * "ON_PREM". Falls back to "PUBLIC" for legacy assessments missing
     * catalogVersionId (Phase 1 backfill made this nullable). */
    catalogEdition: string;
    /** SAP catalog version the assessment is pinned to (e.g. "2602", "2025-FPS1"). */
    catalogVersion: string;
  };
  totals: {
    grand: number;
    O: number;
    C: number;
    G: number;
    NA: number;
    Pending: number;
  };
  perClass: Record<string, ClassificationModuleBreakdown>;
  perModule: ClassificationModuleBreakdown[];
  byBucket: Record<ClassificationBucket, ClassificationRow[]>;
}

/** Bucket Aptus's classification text into one of 5 stable buckets. */
function bucketOf(classification: string | null | undefined): ClassificationBucket {
  const s = (classification ?? "").trim().toUpperCase();
  if (!s) return "Pending";
  // The classifier emits "O - Out Of The Box", "C - Configuration", "G - Gap".
  // Older imports may have "NM - Not Met", "N/A", etc.
  if (s.startsWith("O")) return "O";
  if (s.startsWith("C")) return "C";
  if (s.startsWith("G")) return "G";
  if (s.startsWith("N/A") || s.startsWith("NA") || s.startsWith("N -")) return "NA";
  return "Pending";
}

function emptyBreakdown(module: string): ClassificationModuleBreakdown {
  return { module, total: 0, O: 0, C: 0, G: 0, NA: 0, Pending: 0 };
}

export async function getSapBestPracticeClassificationData(
  assessmentId: string,
): Promise<SapBestPracticeClassificationData> {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    select: {
      companyName: true,
      industry: true,
      country: true,
      updatedAt: true,
      sapVersion: true,
      catalogVersion: { select: { edition: true, version: true } },
    },
  });
  const catalogEdition = assessment.catalogVersion?.edition ?? "PUBLIC";
  const catalogVersion = assessment.catalogVersion?.version ?? assessment.sapVersion ?? "2602";

  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId },
    select: {
      id: true,
      module: true,
      code: true,
      requirementClass: true,
      requirementType: true,
      requirementText: true,
      solutionProviderResponse: true,
      solutionProviderRemarks: true,
      erpModuleSupporting: true,
      sapModule: true,
      scopeItemIds: true,
      scopeItemNames: true,
      sortOrder: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });

  const totals = { grand: 0, O: 0, C: 0, G: 0, NA: 0, Pending: 0 };
  const perClass: Record<string, ClassificationModuleBreakdown> = {};
  const perModuleMap = new Map<string, ClassificationModuleBreakdown>();
  const byBucket: Record<ClassificationBucket, ClassificationRow[]> = {
    O: [], C: [], G: [], NA: [], Pending: [],
  };

  for (const r of reqs) {
    const bucket = bucketOf(r.solutionProviderResponse);
    const cls = r.requirementClass ?? "unclassified";
    const row: ClassificationRow = {
      id: r.id,
      module: r.module,
      code: r.code,
      requirementClass: cls,
      requirementType: r.requirementType,
      requirementText: r.requirementText,
      classification: r.solutionProviderResponse ?? "",
      remarks: r.solutionProviderRemarks ?? "",
      scopeItems: r.erpModuleSupporting ?? "",
      sapModule: r.sapModule ?? "",
      scopeItemIds: r.scopeItemIds ?? "",
      scopeItemNames: r.scopeItemNames ?? "",
      bucket,
    };

    totals.grand++;
    totals[bucket]++;

    if (!perClass[cls]) perClass[cls] = emptyBreakdown(cls);
    perClass[cls].total++;
    perClass[cls][bucket]++;

    if (!perModuleMap.has(r.module)) perModuleMap.set(r.module, emptyBreakdown(r.module));
    const mod = perModuleMap.get(r.module)!;
    mod.total++;
    mod[bucket]++;

    byBucket[bucket].push(row);
  }

  const perModule = [...perModuleMap.values()].sort((a, b) => b.total - a.total);

  return {
    assessment: {
      companyName: assessment.companyName,
      industry: assessment.industry,
      country: assessment.country,
      updatedAt: assessment.updatedAt,
      catalogEdition,
      catalogVersion,
    },
    totals,
    perClass,
    perModule,
    byBucket,
  };
}
