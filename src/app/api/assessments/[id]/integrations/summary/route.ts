/** GET: Integration register summary statistics */

import { NextResponse } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { getIntegrationSummary } from "@/lib/db/registers";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const summary = await getIntegrationSummary(assessmentId);

  return NextResponse.json({ data: summary });
}
