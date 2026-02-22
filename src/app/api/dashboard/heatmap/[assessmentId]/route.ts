/** GET: Heatmap data for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { getHeatmapColor } from "@/lib/dashboard/widgets";
import type { HeatmapCell } from "@/types/dashboard";

export const preferredRegion = "sin1";

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

  const { assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  // Get all scope items with their steps and responses
  const scopeItems = await prisma.scopeItem.findMany({
    select: {
      id: true,
      nameClean: true,
      totalSteps: true,
    },
  });

  const responses = await prisma.stepResponse.findMany({
    where: { assessmentId },
    select: {
      processStepId: true,
      fitStatus: true,
    },
  });

  // Get processStepId -> scopeItemId mapping
  const stepToScope = new Map<string, string>();
  const steps = await prisma.processStep.findMany({
    select: { id: true, scopeItemId: true },
  });
  for (const step of steps) {
    stepToScope.set(step.id, step.scopeItemId);
  }

  // Count completed responses per scope item
  const completedByScope = new Map<string, number>();
  for (const response of responses) {
    if (response.fitStatus !== "PENDING") {
      const scopeId = stepToScope.get(response.processStepId);
      if (scopeId) {
        completedByScope.set(scopeId, (completedByScope.get(scopeId) ?? 0) + 1);
      }
    }
  }

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
