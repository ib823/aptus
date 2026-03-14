/** GET: Gap rollup — cost, risk heatmap, upgrade impact, approval status */

import { NextResponse, type NextRequest } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { computeCostRollup, computeRiskHeatMap, analyzeUpgradeImpact } from "@/lib/assessment/gap-analytics";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

  const gaps = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: {
      id: true,
      resolutionType: true,
      resolutionDescription: true,
      oneTimeCost: true,
      recurringCost: true,
      costCurrency: true,
      implementationDays: true,
      riskLevel: true,
      riskCategory: true,
      upgradeStrategy: true,
      clientApproved: true,
    },
  });

  const costRollup = computeCostRollup(gaps);
  const riskHeatMap = computeRiskHeatMap(gaps);
  const upgradeImpact = analyzeUpgradeImpact(gaps);

  const total = gaps.length;
  const resolved = gaps.filter((g) => g.resolutionType !== "PENDING").length;
  const approved = gaps.filter((g) => g.clientApproved).length;

  return NextResponse.json({
    data: {
      costRollup,
      riskHeatMap,
      upgradeImpact,
      approvalStatus: {
        total,
        approved,
        pending: resolved - approved,
        unresolvedCount: total - resolved,
      },
    },
  });
}
