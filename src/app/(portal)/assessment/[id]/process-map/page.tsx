import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { computeRiskScore } from "@/lib/assessment/risk-score";
import { ProcessMapClient } from "./ProcessMapClient";
import type { FunctionalAreaOverviewData } from "@/types/flow";

interface ProcessMapPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scopeItem?: string }>;
}

export default async function ProcessMapPage({ params, searchParams }: ProcessMapPageProps) {
  const { id: assessmentId } = await params;
  const { scopeItem: selectedScopeItemId } = await searchParams;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, companyName: true },
  });

  if (!assessment) notFound();

  // REM-24: Pre-fetch overview data server-side to avoid client-side auth issues
  const scopeSelections = await prisma.scopeSelection.findMany({
    where: { assessmentId },
    select: { scopeItemId: true, selected: true },
  });

  const selectedIds = scopeSelections
    .filter((s) => s.selected)
    .map((s) => s.scopeItemId);

  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: selectedIds } },
    select: { id: true, nameClean: true, functionalArea: true, totalSteps: true },
  });

  const stepResponses = await prisma.stepResponse.findMany({
    where: { assessmentId },
    select: {
      fitStatus: true,
      processStep: { select: { scopeItemId: true } },
    },
  });

  const gapResolutions = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: { scopeItemId: true, resolutionType: true },
  });

  // Build functional area overview
  const areaMap = new Map<string, FunctionalAreaOverviewData>();

  for (const si of scopeItems) {
    const area = si.functionalArea;
    if (!areaMap.has(area)) {
      areaMap.set(area, {
        functionalArea: area,
        totalScopeItems: 0,
        selectedCount: 0,
        fitCount: 0,
        configureCount: 0,
        gapCount: 0,
        pendingCount: 0,
        riskScore: 0,
        completionPct: 0,
        crossAreaDeps: [],
        scopeItems: [],
      });
    }
    const areaData = areaMap.get(area)!;

    const allInArea = scopeSelections.filter((s) => {
      const item = scopeItems.find((si2) => si2.id === s.scopeItemId);
      return item?.functionalArea === area;
    });
    areaData.totalScopeItems = allInArea.length;
    areaData.selectedCount = allInArea.filter((s) => s.selected).length;

    const itemResponses = stepResponses.filter(
      (r) => r.processStep.scopeItemId === si.id,
    );
    let itemFit = 0, itemConfigure = 0, itemGap = 0;
    for (const r of itemResponses) {
      switch (r.fitStatus) {
        case "FIT": itemFit++; break;
        case "CONFIGURE": itemConfigure++; break;
        case "GAP": itemGap++; break;
      }
    }
    const itemPending = Math.max(0, si.totalSteps - itemResponses.length);

    areaData.fitCount += itemFit;
    areaData.configureCount += itemConfigure;
    areaData.gapCount += itemGap;
    areaData.pendingCount += itemPending;

    const completionPct = si.totalSteps > 0
      ? Math.round((itemResponses.length / si.totalSteps) * 100) : 0;

    areaData.scopeItems.push({
      scopeItemId: si.id,
      scopeItemName: si.nameClean,
      totalSteps: si.totalSteps,
      fitCount: itemFit,
      configureCount: itemConfigure,
      gapCount: itemGap,
      pendingCount: itemPending,
      completionPct,
    });
  }

  for (const areaData of areaMap.values()) {
    const totalSteps = areaData.scopeItems.reduce((sum, si) => sum + si.totalSteps, 0);
    const totalResponded = areaData.fitCount + areaData.configureCount + areaData.gapCount;
    areaData.completionPct = totalSteps > 0
      ? Math.round((totalResponded / totalSteps) * 100) : 0;

    const areaScopeItemIds = areaData.scopeItems.map((si) => si.scopeItemId);
    const areaResolutions = gapResolutions
      .filter((r) => areaScopeItemIds.includes(r.scopeItemId))
      .map((r) => r.resolutionType);

    areaData.riskScore = computeRiskScore(
      totalSteps, areaData.gapCount, areaData.pendingCount, areaResolutions,
    );
  }

  const initialAreas = [...areaMap.values()].sort((a, b) =>
    a.functionalArea.localeCompare(b.functionalArea),
  );

  return (
    <div className="px-4">
      <ProcessMapClient
        assessmentId={assessment.id}
        initialScopeItemId={selectedScopeItemId ?? null}
        initialAreas={initialAreas}
      />
    </div>
  );
}
