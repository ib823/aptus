/** GET: Functional area overview data for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { computeRiskScore } from "@/lib/assessment/risk-score";
import { ERROR_CODES } from "@/types/api";
import type { FunctionalAreaOverviewData } from "@/types/flow";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  // Get scope selections with scope item info
  const scopeSelections = await prisma.scopeSelection.findMany({
    where: { assessmentId },
    select: {
      scopeItemId: true,
      selected: true,
    },
  });

  const selectedScopeItemIds = scopeSelections
    .filter((s) => s.selected)
    .map((s) => s.scopeItemId);

  // Get scope items with functional areas
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: selectedScopeItemIds } },
    select: {
      id: true,
      nameClean: true,
      functionalArea: true,
      totalSteps: true,
    },
  });

  // Get step responses for this assessment
  const stepResponses = await prisma.stepResponse.findMany({
    where: { assessmentId },
    select: {
      processStepId: true,
      fitStatus: true,
      processStep: {
        select: { scopeItemId: true },
      },
    },
  });

  // Get gap resolutions for risk scoring
  const gapResolutions = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: {
      scopeItemId: true,
      resolutionType: true,
    },
  });

  // Build response by functional area
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

    // Count scope items
    const allInArea = scopeSelections.filter((s) => {
      const item = scopeItems.find((si2) => si2.id === s.scopeItemId);
      return item?.functionalArea === area;
    });
    areaData.totalScopeItems = allInArea.length;
    areaData.selectedCount = allInArea.filter((s) => s.selected).length;

    // Count step statuses for this scope item
    const itemResponses = stepResponses.filter(
      (r) => r.processStep.scopeItemId === si.id,
    );
    let itemFit = 0;
    let itemConfigure = 0;
    let itemGap = 0;
    let itemPending = 0;
    for (const r of itemResponses) {
      switch (r.fitStatus) {
        case "FIT": itemFit++; break;
        case "CONFIGURE": itemConfigure++; break;
        case "GAP": itemGap++; break;
        default: break;
      }
    }
    // Steps without responses are pending
    itemPending = Math.max(0, si.totalSteps - itemResponses.length);

    areaData.fitCount += itemFit;
    areaData.configureCount += itemConfigure;
    areaData.gapCount += itemGap;
    areaData.pendingCount += itemPending;

    const totalResponded = itemResponses.length;
    const completionPct = si.totalSteps > 0 ? Math.round((totalResponded / si.totalSteps) * 100) : 0;

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

  // Compute risk scores and completion percentages per area
  for (const areaData of areaMap.values()) {
    const totalSteps = areaData.scopeItems.reduce((sum, si) => sum + si.totalSteps, 0);
    const totalResponded = areaData.fitCount + areaData.configureCount + areaData.gapCount;
    areaData.completionPct = totalSteps > 0 ? Math.round((totalResponded / totalSteps) * 100) : 0;

    // Get resolutions for this area
    const areaScopeItemIds = areaData.scopeItems.map((si) => si.scopeItemId);
    const areaResolutions = gapResolutions
      .filter((r) => areaScopeItemIds.includes(r.scopeItemId))
      .map((r) => r.resolutionType);

    areaData.riskScore = computeRiskScore(
      totalSteps,
      areaData.gapCount,
      areaData.pendingCount,
      areaResolutions,
    );
  }

  const result = [...areaMap.values()].sort((a, b) =>
    a.functionalArea.localeCompare(b.functionalArea),
  );

  return NextResponse.json({ data: result });
}
