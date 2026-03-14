/** GET: Get auto-suggested resolution patterns for a gap */

import { NextResponse, type NextRequest } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { suggestResolutions } from "@/lib/assessment/gap-suggest";
import { ERROR_CODES } from "@/types/api";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; gapId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, gapId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

  // Get the gap description
  const gap = await prisma.gapResolution.findUnique({
    where: { id: gapId },
    select: { assessmentId: true, gapDescription: true },
  });

  if (!gap || gap.assessmentId !== assessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Gap resolution not found" } },
      { status: 404 },
    );
  }

  // Fetch patterns to match against
  const [extensibilityPatterns, adaptationPatterns] = await Promise.all([
    prisma.extensibilityPattern.findMany({
      select: {
        id: true,
        gapPattern: true,
        resolutionType: true,
        resolutionDescription: true,
        effortDays: true,
        riskLevel: true,
      },
    }),
    prisma.adaptationPattern.findMany({
      select: {
        id: true,
        commonGap: true,
        recommendation: true,
        rationale: true,
      },
    }),
  ]);

  // Normalize to common shape for suggestion engine
  const allPatterns = [
    ...extensibilityPatterns.map((p) => ({
      id: p.id,
      description: `${p.gapPattern} ${p.resolutionDescription}`,
      resolutionType: p.resolutionType,
      effortDays: p.effortDays,
      riskLevel: p.riskLevel,
    })),
    ...adaptationPatterns.map((p) => ({
      id: p.id,
      description: `${p.commonGap} ${p.rationale}`,
      resolutionType: p.recommendation,
      effortDays: undefined,
      riskLevel: undefined,
    })),
  ];

  const suggestions = suggestResolutions(gap.gapDescription, allPatterns);

  return NextResponse.json({ data: suggestions });
}
