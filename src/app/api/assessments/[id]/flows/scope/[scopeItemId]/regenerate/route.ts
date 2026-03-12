/** POST: Force-regenerate flow data for a scope item */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { hasPermission } from "@/lib/auth/permission-matrix";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { generateInteractiveFlowData } from "@/lib/flow/interactive-flow";
import { generateThumbnailSvg } from "@/lib/flow/thumbnail-generator";
import { computeRiskOverlay } from "@/lib/flow/risk-overlay";
import type { InputJsonValue } from "@prisma/client/runtime/library";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; scopeItemId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, scopeItemId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  if (!hasPermission(user.role, "assessment.edit")) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const scopeSelection = await prisma.scopeSelection.findFirst({
    where: { assessmentId, scopeItemId, selected: true },
    select: { id: true },
  });

  if (!scopeSelection) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Scope item not selected in this assessment" } },
      { status: 403 },
    );
  }

  // Load steps with responses
  const steps = await prisma.processStep.findMany({
    where: { scopeItemId },
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      sequence: true,
      actionTitle: true,
      scopeItemId: true,
      processFlowGroup: true,
      stepResponses: {
        where: { assessmentId },
        select: { fitStatus: true, clientNote: true },
        take: 1,
      },
    },
  });

  const stepsWithResponse = steps.map((s) => ({
    id: s.id,
    sequence: s.sequence,
    actionTitle: s.actionTitle,
    scopeItemId: s.scopeItemId,
    fitStatus: s.stepResponses[0]?.fitStatus ?? "PENDING",
    clientNote: s.stepResponses[0]?.clientNote ?? undefined,
  }));

  const interactiveData = generateInteractiveFlowData(stepsWithResponse);
  const thumbnailSvg = generateThumbnailSvg(stepsWithResponse);

  // Compute risk overlay
  const gapResolutions = await prisma.gapResolution.findMany({
    where: { assessmentId, scopeItemId },
    select: { processStepId: true, resolutionType: true },
  });
  const resMap = new Map(gapResolutions.map((r) => [r.processStepId, r.resolutionType]));
  const riskOverlayData = computeRiskOverlay(
    stepsWithResponse.map((s) => ({
      processStepId: s.id,
      fitStatus: s.fitStatus,
      hasResolution: resMap.has(s.id),
    })),
  );

  const updated = await prisma.processFlowDiagram.updateMany({
    where: { assessmentId, scopeItemId },
    data: {
      interactiveData: JSON.parse(JSON.stringify(interactiveData)) as InputJsonValue,
      thumbnailSvg,
      riskOverlayData: JSON.parse(JSON.stringify(riskOverlayData)) as InputJsonValue,
      layoutVersion: 1,
    },
  });

  return NextResponse.json({
    data: { regenerated: updated.count, scopeItemId },
  });
}
