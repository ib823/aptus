/** GET: Data migration register summary statistics */

import { NextResponse } from "next/server";
import { getDataMigrationSummary } from "@/lib/db/registers";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const { user } = access;
  const summary = await getDataMigrationSummary(assessmentId);

  return NextResponse.json({ data: summary });
}
