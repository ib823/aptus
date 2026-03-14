/** GET: Functional area overview data for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildFunctionalAreaOverviewFromCounts } from "@/lib/assessment/functional-area-overview";
import { ERROR_CODES } from "@/types/api";
import type { ResponseCountRow, GapResolutionCountRow } from "@/types/assessment";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

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

  // Selected scope items only (overview is scoped to active assessment selection)
  const scopeSelections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: {
      scopeItemId: true,
    },
  });

  const selectedScopeItemIds = scopeSelections.map((s) => s.scopeItemId);
  if (selectedScopeItemIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

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

  const [responseCounts, gapResolutionCounts] = await Promise.all([
    prisma.$queryRaw<ResponseCountRow[]>`
      SELECT ps."scopeItemId", sr."fitStatus", COUNT(*)::int AS count
      FROM "StepResponse" sr
      JOIN "ProcessStep" ps ON sr."processStepId" = ps.id
      WHERE sr."assessmentId" = ${assessmentId}
        AND ps."scopeItemId" = ANY(${selectedScopeItemIds})
      GROUP BY ps."scopeItemId", sr."fitStatus"
    `,
    prisma.$queryRaw<GapResolutionCountRow[]>`
      SELECT "scopeItemId", "resolutionType", COUNT(*)::int AS count
      FROM "GapResolution"
      WHERE "assessmentId" = ${assessmentId}
        AND "scopeItemId" = ANY(${selectedScopeItemIds})
      GROUP BY "scopeItemId", "resolutionType"
    `,
  ]);

  const result = buildFunctionalAreaOverviewFromCounts({
    scopeItems,
    responseCounts,
    gapResolutionCounts,
  });

  return NextResponse.json({ data: result });
}
