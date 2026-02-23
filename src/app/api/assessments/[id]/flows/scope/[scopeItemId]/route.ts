/** GET: Flow data for a scope item (SVG + interactive + thumbnail + risk overlay) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { generateInteractiveFlowData } from "@/lib/flow/interactive-flow";
import { generateThumbnailSvg } from "@/lib/flow/thumbnail-generator";
import { computeRiskOverlay } from "@/lib/flow/risk-overlay";
import type { InteractiveFlowData, RiskOverlayEntry } from "@/types/flow";
import type { InputJsonValue } from "@prisma/client/runtime/library";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; scopeItemId: string }> },
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

  const { id: assessmentId, scopeItemId } = await params;

  // Find existing flow diagram(s) for this scope item
  const diagrams = await prisma.processFlowDiagram.findMany({
    where: { assessmentId, scopeItemId },
    select: {
      id: true,
      processFlowName: true,
      svgContent: true,
      interactiveData: true,
      thumbnailSvg: true,
      riskOverlayData: true,
      stepCount: true,
      fitCount: true,
      configureCount: true,
      gapCount: true,
      naCount: true,
      pendingCount: true,
    },
  });

  if (diagrams.length === 0) {
    // Generate on-the-fly
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

    if (steps.length === 0) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.NOT_FOUND, message: "No process steps found for this scope item" } },
        { status: 404 },
      );
    }

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

    return NextResponse.json({
      data: [{
        id: null,
        processFlowName: "default",
        interactiveData,
        thumbnailSvg,
        riskOverlayData,
        stepCount: steps.length,
      }],
    });
  }

  // Return existing diagrams, generating interactive data if missing
  const result = [];
  for (const d of diagrams) {
    let interactiveData = d.interactiveData as unknown as InteractiveFlowData | null;
    let thumbnailSvg = d.thumbnailSvg;
    let riskOverlayData = d.riskOverlayData as unknown as RiskOverlayEntry[] | null;

    if (!interactiveData || !thumbnailSvg || !riskOverlayData) {
      const steps = await prisma.processStep.findMany({
        where: { scopeItemId, processFlowGroup: d.processFlowName },
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          actionTitle: true,
          scopeItemId: true,
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

      if (!interactiveData) {
        interactiveData = generateInteractiveFlowData(stepsWithResponse);
      }
      if (!thumbnailSvg) {
        thumbnailSvg = generateThumbnailSvg(stepsWithResponse);
      }
      if (!riskOverlayData) {
        const gapResolutions = await prisma.gapResolution.findMany({
          where: { assessmentId, scopeItemId },
          select: { processStepId: true, resolutionType: true },
        });
        const resMap = new Map(gapResolutions.map((r) => [r.processStepId, r.resolutionType]));
        riskOverlayData = computeRiskOverlay(
          stepsWithResponse.map((s) => ({
            processStepId: s.id,
            fitStatus: s.fitStatus,
            hasResolution: resMap.has(s.id),
          })),
        );
      }

      // Cache generated data
      await prisma.processFlowDiagram.update({
        where: { id: d.id },
        data: {
          interactiveData: JSON.parse(JSON.stringify(interactiveData)) as InputJsonValue,
          thumbnailSvg,
          riskOverlayData: JSON.parse(JSON.stringify(riskOverlayData)) as InputJsonValue,
        },
      });
    }

    result.push({
      id: d.id,
      processFlowName: d.processFlowName,
      svgContent: d.svgContent,
      interactiveData,
      thumbnailSvg,
      riskOverlayData,
      stepCount: d.stepCount,
      fitCount: d.fitCount,
      configureCount: d.configureCount,
      gapCount: d.gapCount,
      naCount: d.naCount,
      pendingCount: d.pendingCount,
    });
  }

  return NextResponse.json({ data: result });
}
