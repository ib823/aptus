/** GET: List active editing locks for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { getActiveLocks } from "@/lib/collaboration/lock-manager";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const locks = await getActiveLocks(assessmentId);

  return NextResponse.json({ data: locks });
}
