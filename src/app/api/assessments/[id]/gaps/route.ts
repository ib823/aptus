/** GET: Gap resolutions for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { getGapsForAssessment, getGapSummaryStats } from "@/lib/db/gap-resolutions";
import { ERROR_CODES } from "@/types/api";


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

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;

  const scopeItemId = request.nextUrl.searchParams.get("scopeItemId") ?? undefined;
  const resolutionType = request.nextUrl.searchParams.get("resolutionType") ?? undefined;
  const priority = request.nextUrl.searchParams.get("priority") ?? undefined;
  const riskCategory = request.nextUrl.searchParams.get("riskCategory") ?? undefined;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;

  const [result, summary] = await Promise.all([
    getGapsForAssessment(assessmentId, { scopeItemId, resolutionType, priority, riskCategory, cursor }),
    getGapSummaryStats(assessmentId),
  ]);

  return NextResponse.json({
    data: result.gaps,
    summary,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  });
}
