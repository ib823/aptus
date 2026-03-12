/** GET: KPI metrics for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { KpiMetrics } from "@/types/dashboard";

/** Map OCM severity to a numeric impact score for KPI calculation */
function severityToScore(severity: string): number {
  switch (severity) {
    case "TRANSFORMATIONAL":
      return 5;
    case "HIGH":
      return 4;
    case "MEDIUM":
      return 3;
    case "LOW":
      return 2;
    default:
      return 1;
  }
}
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
    select: { id: true, organizationId: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  if (user.organizationId && assessment.organizationId !== user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Access denied" } },
      { status: 403 },
    );
  }

  // Only count steps/gaps for scope items the user actually selected
  const selectedScopeIds = (
    await prisma.scopeSelection.findMany({
      where: { assessmentId, selected: true },
      select: { scopeItemId: true },
    })
  ).map((s) => s.scopeItemId);

  const scopeFilter = selectedScopeIds.length > 0
    ? { processStep: { scopeItemId: { in: selectedScopeIds } } }
    : { id: "__none__" as string }; // no scope selected → zero results

  const [stepStats, gapStats, integrationStats, migrationStats, ocmStats] = await Promise.all([
    prisma.stepResponse.groupBy({
      by: ["fitStatus"],
      where: { assessmentId, ...scopeFilter },
      _count: { _all: true },
    }),
    prisma.gapResolution.groupBy({
      by: ["resolutionType"],
      where: { assessmentId, scopeItemId: selectedScopeIds.length > 0 ? { in: selectedScopeIds } : "__none__" },
      _count: { _all: true },
    }),
    prisma.integrationPoint.groupBy({
      by: ["status"],
      where: { assessmentId },
      _count: { _all: true },
    }),
    prisma.dataMigrationObject.groupBy({
      by: ["status"],
      where: { assessmentId },
      _count: { _all: true },
    }),
    prisma.ocmImpact.groupBy({
      by: ["severity"],
      where: { assessmentId },
      _count: { _all: true },
    }),
  ]);

  let totalSteps = 0;
  let fitCount = 0;
  let configureCount = 0;
  let gapCount = 0;
  let naCount = 0;
  let pendingCount = 0;

  for (const row of stepStats) {
    const count = row._count._all;
    totalSteps += count;
    switch (row.fitStatus) {
      case "FIT":
        fitCount += count;
        break;
      case "CONFIGURE":
        configureCount += count;
        break;
      case "GAP":
        gapCount += count;
        break;
      case "NA":
        naCount += count;
        break;
      default:
        pendingCount += count;
        break;
    }
  }

  const completedSteps = fitCount + configureCount + gapCount + naCount;
  const completionPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const totalGaps = gapStats.reduce((sum, row) => sum + row._count._all, 0);
  const resolvedGaps = gapStats.reduce((sum, row) => {
    if (!row.resolutionType || row.resolutionType === "PENDING") return sum;
    return sum + row._count._all;
  }, 0);
  const gapResolutionPercent = totalGaps > 0 ? Math.round((resolvedGaps / totalGaps) * 100) : 0;

  const totalIntegrations = integrationStats.reduce((sum, row) => sum + row._count._all, 0);
  const completedIntegrations = integrationStats.reduce((sum, row) => {
    if (row.status.toUpperCase() === "COMPLETED") return sum + row._count._all;
    return sum;
  }, 0);
  const integrationPercent =
    totalIntegrations > 0 ? Math.round((completedIntegrations / totalIntegrations) * 100) : 0;

  const totalMigrations = migrationStats.reduce((sum, row) => sum + row._count._all, 0);
  const completedMigrations = migrationStats.reduce((sum, row) => {
    if (row.status.toUpperCase() === "COMPLETED") return sum + row._count._all;
    return sum;
  }, 0);
  const migrationPercent =
    totalMigrations > 0 ? Math.round((completedMigrations / totalMigrations) * 100) : 0;

  let ocmWeightedScoreTotal = 0;
  let ocmCount = 0;
  let ocmHighImpactCount = 0;
  for (const row of ocmStats) {
    const score = severityToScore(row.severity);
    const count = row._count._all;
    ocmWeightedScoreTotal += score * count;
    ocmCount += count;
    if (score >= 4) {
      ocmHighImpactCount += count;
    }
  }
  const ocmAverageScore = ocmCount > 0 ? Math.round(ocmWeightedScoreTotal / ocmCount) : 0;

  const metrics: KpiMetrics = {
    totalSteps,
    completedSteps,
    completionPercent,
    fitCount,
    configureCount,
    gapCount,
    naCount,
    pendingCount,
    totalGaps,
    resolvedGaps,
    gapResolutionPercent,
    totalIntegrations,
    completedIntegrations,
    integrationPercent,
    totalMigrations,
    completedMigrations,
    migrationPercent,
    ocmAverageScore,
    ocmHighImpactCount,
  };

  return NextResponse.json({ data: metrics });
}
