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

  // Step response stats
  const stepResponses = await prisma.stepResponse.findMany({
    where: { assessmentId },
    select: { fitStatus: true },
  });
  const totalStepsReviewed = stepResponses.length;
  const fitCount = stepResponses.filter((s) => s.fitStatus === "FIT").length;
  const configureCount = stepResponses.filter((s) => s.fitStatus === "CONFIGURE").length;
  const gapCount = stepResponses.filter((s) => s.fitStatus === "GAP").length;
  const naCount = stepResponses.filter((s) => s.fitStatus === "NA").length;

  // Total process steps for selected scope
  const totalProcessSteps = await prisma.processStep.count({
    where: { scopeItemId: { in: selectedScopeIds } },
  });
  const pendingSteps = totalProcessSteps - totalStepsReviewed;
  const fitPercent = totalProcessSteps > 0
    ? Math.round(((fitCount + configureCount) / totalProcessSteps) * 100)
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
      total: totalProcessSteps,
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

/** Per-area outcome distribution derived from GapResolution. Areas without
 * gaps are assumed to be all FIT (the "nothing to build" outcome). */
async function buildAreaOutcomeMap(assessmentId: string): Promise<Map<string, Partial<Record<ResolutionType, number>>>> {
  const gaps = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: { scopeItemId: true, resolutionType: true },
  });
  const scopeItemIds = [...new Set(gaps.map((g) => g.scopeItemId))];
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: scopeItemIds } },
    select: { id: true, functionalArea: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s.functionalArea ?? "Unassigned"]));

  const result = new Map<string, Partial<Record<ResolutionType, number>>>();
  for (const g of gaps) {
    const area = scopeMap.get(g.scopeItemId) ?? "Unassigned";
    const rt = normalizeResolutionType(g.resolutionType);
    const bucket = result.get(area) ?? {};
    bucket[rt] = (bucket[rt] ?? 0) + 1;
    result.set(area, bucket);
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
      sortOrder: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });

  const areaOutcomes = await buildAreaOutcomeMap(assessmentId);

  // Group requirements by module
  const byModule = new Map<string, typeof reqs>();
  for (const r of reqs) {
    const key = r.module || "Unassigned";
    const list = byModule.get(key) ?? [];
    list.push(r);
    byModule.set(key, list);
  }

  // Build totals (across all areas)
  const totalsByOutcome: Partial<Record<ResolutionType, number>> = {};
  for (const [, dist] of areaOutcomes) {
    for (const [rt, count] of Object.entries(dist)) {
      const k = rt as ResolutionType;
      totalsByOutcome[k] = (totalsByOutcome[k] ?? 0) + (count ?? 0);
    }
  }
  // Requirements without a corresponding gap → assumed FIT
  const totalReqs = reqs.length;
  const accountedFor = Object.values(totalsByOutcome).reduce<number>((s, n) => s + (n ?? 0), 0);
  totalsByOutcome.FIT = (totalsByOutcome.FIT ?? 0) + Math.max(0, totalReqs - accountedFor);

  // Build per-area summaries with sample cards
  const byArea = [...byModule.entries()].map(([area, areaReqs]) => {
    const dist = areaOutcomes.get(area) ?? {};
    const accountedForArea = Object.values(dist).reduce<number>((s, n) => s + (n ?? 0), 0);
    const distWithFit: Partial<Record<ResolutionType, number>> = {
      ...dist,
      FIT: (dist.FIT ?? 0) + Math.max(0, areaReqs.length - accountedForArea),
    };
    const dominantOutcome = pickDominantOutcome(distWithFit);

    return {
      area,
      total: areaReqs.length,
      byOutcome: distWithFit,
      cards: areaReqs.slice(0, 4).map((r) => ({
        reqId: r.code,
        yourAsk: r.requirementText,
        whatSapDoes: r.solutionProviderResponse?.trim() || outcomeMeans(dominantOutcome),
        resolutionType: dominantOutcome,
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

function pickDominantOutcome(dist: Partial<Record<ResolutionType, number>>): ResolutionType {
  let best: ResolutionType = "FIT";
  let bestCount = -1;
  for (const [rt, count] of Object.entries(dist)) {
    if ((count ?? 0) > bestCount) {
      best = rt as ResolutionType;
      bestCount = count ?? 0;
    }
  }
  return best;
}

/** Build the shape consumed by requirementsTraceabilitySheet.
 * One row per ClientRequirement with derived outcome from the area's
 * gap distribution. */
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
      sortOrder: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });

  const areaOutcomes = await buildAreaOutcomeMap(assessmentId);

  return reqs.map((r) => {
    const dist = areaOutcomes.get(r.module || "Unassigned") ?? {};
    const outcome = pickDominantOutcome(dist);
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
      effortDays: 0, // TODO: link req → step → gap effortDays in a future phase
      owner: "—",
      notes: "",
    };
  });
}
