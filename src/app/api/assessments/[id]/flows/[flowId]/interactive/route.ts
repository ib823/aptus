/** GET: Interactive flow data for a flow diagram */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { computeSequentialLayout } from "@/lib/assessment/flow-layout";
import { ERROR_CODES } from "@/types/api";
import type { InteractiveFlowData } from "@/types/flow";
import type { LayoutStep } from "@/lib/assessment/flow-layout";
import type { InputJsonValue } from "@prisma/client/runtime/library";

export const preferredRegion = "sin1";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; flowId: string }> },
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

  const { id: assessmentId, flowId } = await params;

  const flow = await prisma.processFlowDiagram.findFirst({
    where: { id: flowId, assessmentId },
    select: {
      id: true,
      scopeItemId: true,
      processFlowName: true,
      interactiveData: true,
      layoutVersion: true,
    },
  });

  if (!flow) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Flow diagram not found" } },
      { status: 404 },
    );
  }

  // If we have cached interactive data, return it
  if (flow.interactiveData) {
    return NextResponse.json({ data: flow.interactiveData as unknown as InteractiveFlowData });
  }

  // Generate interactive data from steps
  const steps = await prisma.processStep.findMany({
    where: {
      scopeItemId: flow.scopeItemId,
      processFlowGroup: flow.processFlowName,
    },
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

  const layoutSteps: LayoutStep[] = steps.map((s) => ({
    id: s.id,
    sequence: s.sequence,
    actionTitle: s.actionTitle,
    fitStatus: s.stepResponses[0]?.fitStatus ?? "PENDING",
    scopeItemId: s.scopeItemId,
    processStepId: s.id,
    clientNote: s.stepResponses[0]?.clientNote ?? undefined,
  }));

  const layout = computeSequentialLayout(layoutSteps);
  const interactiveData: InteractiveFlowData = {
    ...layout,
    layoutVersion: 1,
  };

  // Cache the result
  await prisma.processFlowDiagram.update({
    where: { id: flow.id },
    data: {
      interactiveData: JSON.parse(JSON.stringify(interactiveData)) as InputJsonValue,
      layoutVersion: 1,
    },
  });

  return NextResponse.json({ data: interactiveData });
}
