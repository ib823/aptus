/** GET: KPI metrics for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { calculateKpiMetrics } from "@/lib/dashboard/kpi-calculator";

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
    select: { id: true, organizationId: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const [steps, gaps, integrations, migrations, ocmImpacts] = await Promise.all([
    prisma.stepResponse.findMany({
      where: { assessmentId },
      select: { fitStatus: true },
    }),
    prisma.gapResolution.findMany({
      where: { assessmentId },
      select: { resolutionType: true },
    }),
    prisma.integrationPoint.findMany({
      where: { assessmentId },
      select: { status: true },
    }),
    prisma.dataMigrationObject.findMany({
      where: { assessmentId },
      select: { status: true },
    }),
    prisma.ocmImpact.findMany({
      where: { assessmentId },
      select: { severity: true },
    }),
  ]);

  const metrics = calculateKpiMetrics(
    steps,
    gaps,
    integrations,
    migrations,
    ocmImpacts.map((o) => ({ impactScore: severityToScore(o.severity) })),
  );

  return NextResponse.json({ data: metrics });
}
