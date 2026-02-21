/** GET: Benchmark comparison for a specific assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { computeFitRate, computeBenchmarkComparison, generateInsights } from "@/lib/analytics/benchmark-engine";

export const preferredRegion = "sin1";
export const maxDuration = 30;

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
    select: {
      id: true,
      industry: true,
      companySize: true,
      organizationId: true,
      stepResponses: {
        select: { fitStatus: true },
      },
      gapResolutions: {
        select: { gapDescription: true, resolutionType: true },
      },
    },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  if (user.organizationId && assessment.organizationId !== user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Assessment does not belong to your organization" } },
      { status: 403 },
    );
  }

  // Find benchmark for this industry
  const benchmark = await prisma.benchmarkSnapshot.findFirst({
    where: { industry: assessment.industry },
    orderBy: { computedAt: "desc" },
  });

  const assessmentFitRate = computeFitRate(assessment.stepResponses);

  if (!benchmark) {
    return NextResponse.json({
      data: {
        assessmentFitRate,
        benchmark: null,
        comparison: null,
        insights: ["No benchmark data available for this industry yet."],
        assessmentGaps: assessment.gapResolutions,
      },
    });
  }

  const comparison = computeBenchmarkComparison(assessmentFitRate, benchmark);
  const insights = generateInsights(assessmentFitRate, {
    avgFitRate: benchmark.avgFitRate,
    p25FitRate: benchmark.p25FitRate,
    p75FitRate: benchmark.p75FitRate,
    sampleSize: benchmark.sampleSize,
  });

  // Check which common gaps are present in this assessment
  const assessmentGapDescriptions = new Set(
    assessment.gapResolutions.map((g) => g.gapDescription.toLowerCase().substring(0, 100)),
  );

  const commonGaps = (benchmark.commonGaps as Array<{ description: string; frequency: number; resolutionType: string }>).map((cg) => ({
    ...cg,
    presentInAssessment: assessmentGapDescriptions.has(cg.description.toLowerCase().substring(0, 100)),
  }));

  return NextResponse.json({
    data: {
      assessmentFitRate,
      benchmark: {
        industry: benchmark.industry,
        sampleSize: benchmark.sampleSize,
        avgFitRate: benchmark.avgFitRate,
        avgGapRate: benchmark.avgGapRate,
        avgConfigRate: benchmark.avgConfigRate,
        medianFitRate: benchmark.medianFitRate,
        p25FitRate: benchmark.p25FitRate,
        p75FitRate: benchmark.p75FitRate,
      },
      comparison,
      insights,
      commonGaps,
    },
  });
}
