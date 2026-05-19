/** GET: Heatmap data for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { verifyAssessmentAccess } from "@/lib/auth/verify-assessment-access";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { getHeatmapColor } from "@/lib/dashboard/widgets";
import type { HeatmapCell } from "@/types/dashboard";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> },
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

  const { assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, organizationId: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const hasAccess = await verifyAssessmentAccess(user, assessmentId, assessment.organizationId);
  if (!hasAccess) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Access denied" } },
      { status: 403 },
    );
  }

  // For process_owner role, restrict to their assigned functional areas
  let areaFilter: string[] | null = null;
  if (user.role === "process_owner") {
    const stakeholder = await prisma.assessmentStakeholder.findFirst({
      where: { assessmentId, userId: user.id },
      select: { assignedAreas: true },
    });
    areaFilter = stakeholder?.assignedAreas ?? [];
  }

  // Get selected scope items for this assessment
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });
  const selectedScopeIds = selections.map((s) => s.scopeItemId);

  // Get scope items filtered to selected ones (and area-scoped for process owners)
  const scopeItems = await prisma.scopeItem.findMany({
    where: {
      id: { in: selectedScopeIds },
      ...(areaFilter ? { functionalArea: { in: areaFilter } } : {}),
    },
    select: {
      id: true,
      nameClean: true,
      totalSteps: true,
    },
  });
  const visibleScopeIds = scopeItems.map((si) => si.id);
  if (visibleScopeIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const completedRows = await prisma.$queryRaw<Array<{ scopeItemId: string; completedCount: number }>>(
    Prisma.sql`
      SELECT ps."scopeItemId" AS "scopeItemId", COUNT(*)::int AS "completedCount"
      FROM "StepResponse" sr
      INNER JOIN "ProcessStep" ps ON ps.id = sr."processStepId"
      WHERE sr."assessmentId" = ${assessmentId}
        AND sr."fitStatus" <> 'PENDING'
        AND ps."scopeItemId" IN (${Prisma.join(visibleScopeIds)})
      GROUP BY ps."scopeItemId"
    `,
  );
  const completedByScope = new Map(completedRows.map((row) => [row.scopeItemId, row.completedCount]));

  const heatmapData: HeatmapCell[] = scopeItems.map((si) => {
    const completedSteps = completedByScope.get(si.id) ?? 0;
    const completionPercent =
      si.totalSteps > 0 ? Math.round((completedSteps / si.totalSteps) * 100) : 0;
    return {
      scopeItemId: si.id,
      scopeItemName: si.nameClean,
      completionPercent,
      totalSteps: si.totalSteps,
      completedSteps,
      colorClass: getHeatmapColor(completionPercent),
    };
  });

  return NextResponse.json({ data: heatmapData });
}
