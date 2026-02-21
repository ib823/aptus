/** GET: Portfolio analytics dashboard data */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { computePortfolioSummary, computeFitRateByIndustry, computeTopGaps } from "@/lib/analytics/portfolio-engine";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest): Promise<NextResponse> {
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

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "No organization associated" } },
      { status: 403 },
    );
  }

  // Load assessments for the organization
  const assessments = await prisma.assessment.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      industry: true,
      createdAt: true,
      updatedAt: true,
      stepResponses: {
        select: { fitStatus: true },
      },
      gapResolutions: {
        select: { gapDescription: true, resolutionType: true },
      },
    },
  });

  // Use updatedAt as a proxy for completedAt for completed assessments
  const assessmentsForSummary = assessments.map((a) => ({
    status: a.status,
    stepResponses: a.stepResponses,
    createdAt: a.createdAt,
    completedAt: ["completed", "reviewed", "signed_off", "validated", "handed_off", "archived"].includes(a.status) ? a.updatedAt : null,
  }));

  const summary = computePortfolioSummary(assessmentsForSummary);

  const fitRateByIndustry = computeFitRateByIndustry(
    assessments.map((a) => ({
      industry: a.industry,
      stepResponses: a.stepResponses,
    })),
  );

  const allGaps = assessments.flatMap((a) => a.gapResolutions);
  const topGaps = computeTopGaps(allGaps);

  return NextResponse.json({
    data: {
      summary,
      fitRateByIndustry,
      topGaps: topGaps.slice(0, 20),
    },
  });
}
