/** POST: Force-recompute all functional area overviews */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { hasPermission } from "@/lib/auth/permission-matrix";
import { ERROR_CODES } from "@/types/api";
import { computeFunctionalAreaOverview } from "@/lib/flow/area-overview";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  if (!hasPermission(user.role, "assessment.edit")) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const data = await computeFunctionalAreaOverview(assessmentId);

  return NextResponse.json({ data, regenerated: true });
}
