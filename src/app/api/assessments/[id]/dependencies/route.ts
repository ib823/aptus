/**
 * Phase: Dependency Engine — GET dependency status for an activity.
 *
 * Returns active propagation logs and warnings for the specified
 * activity within the assessment.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getDependencyGraph, getCrossScopeDependencies } from "@/lib/dependency/dependency-loader";
import { evaluateWarnings } from "@/lib/dependency/dependency-warnings";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const querySchema = z.object({
  activityId: z.string().min(1),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (!isFeatureEnabled("DEPENDENCY_ENGINE")) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Dependency engine is not enabled" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ activityId: searchParams.get("activityId") });

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "activityId query parameter is required" } },
      { status: 400 },
    );
  }

  const { activityId } = parsed.data;

  // Look up scope item code for this activity
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: {
      processFlow: {
        select: {
          solutionProcess: {
            select: { scopeItemId: true },
          },
        },
      },
    },
  });

  if (!activity) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Activity not found" } },
      { status: 404 },
    );
  }

  const scopeItemCode =
    activity.processFlow?.solutionProcess?.scopeItemId;

  if (!scopeItemCode) {
    return NextResponse.json({ data: { propagations: [], warnings: [] } });
  }

  // Get active propagation logs for this activity's steps
  const activitySteps = await prisma.processStep.findMany({
    where: { activityId, isClassifiable: true },
    select: { id: true },
  });
  const stepIds = activitySteps.map((s) => s.id);

  const logs = await prisma.dependencyPropagationLog.findMany({
    where: {
      assessmentId,
      affectedStepId: { in: stepIds },
      undone: false,
    },
    orderBy: { createdAt: "desc" },
  });

  // Evaluate current warnings
  const graph = await getDependencyGraph(scopeItemCode);
  const crossScopeDeps = await getCrossScopeDependencies(scopeItemCode);
  const warnings = await evaluateWarnings(
    graph,
    assessmentId,
    activityId,
    crossScopeDeps,
  );

  return NextResponse.json({
    data: {
      propagations: logs,
      warnings: warnings.map((w) => ({
        activityId: w.activityId,
        activityTitle: w.activityTitle,
        scopeItemCode: w.scopeItemCode,
        warningType: w.warningType,
        businessReason: w.businessReason,
      })),
    },
  });
}
