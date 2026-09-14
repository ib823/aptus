/** GET: Benchmark comparison for a specific assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { verifyAssessmentAccess } from "@/lib/auth/verify-assessment-access";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { BENCHMARK_SOURCE_LABEL, MINIMUM_BENCHMARK_SAMPLE_SIZE } from "@/types/analytics";
import { computeFitRate, computeBenchmarkComparison, generateInsights } from "@/lib/analytics/benchmark-engine";
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

  const hasAccess = await verifyAssessmentAccess(user, assessmentId, assessment.organizationId);
  if (!hasAccess) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Assessment does not belong to your organization" } },
      { status: 403 },
    );
  }

  // Cohort of ABeam engagements in the same industry. Not an external panel.
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
        source: BENCHMARK_SOURCE_LABEL,
        insights: ["No comparable ABeam engagements recorded for this industry yet."],
        assessmentGaps: assessment.gapResolutions,
      },
    });
  }

  /**
   * Suppress at the boundary, not just in the UI. nightly-job.ts writes a
   * snapshot for a cohort of any size, so a two-engagement cohort reaches here
   * looking exactly like a fifty-engagement one. Withholding the figures
   * server-side means no client, export or future consumer can render a
   * position the sample does not support.
   */
  if (benchmark.sampleSize < MINIMUM_BENCHMARK_SAMPLE_SIZE) {
    return NextResponse.json({
      data: {
        assessmentFitRate,
        benchmark: null,
        comparison: null,
        source: BENCHMARK_SOURCE_LABEL,
        insights: generateInsights(assessmentFitRate, {
          avgFitRate: benchmark.avgFitRate,
          p25FitRate: benchmark.p25FitRate,
          p75FitRate: benchmark.p75FitRate,
          sampleSize: benchmark.sampleSize,
        }),
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
      source: BENCHMARK_SOURCE_LABEL,
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
