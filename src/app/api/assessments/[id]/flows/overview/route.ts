/** GET: Functional area overview data for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { buildFunctionalAreaOverview } from "@/lib/assessment/functional-area-overview";
import { ERROR_CODES } from "@/types/api";
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

  const result = buildFunctionalAreaOverview({
    scopeItems,
    stepResponses,
    gapResolutions,
  });

  return NextResponse.json({ data: result });
}
