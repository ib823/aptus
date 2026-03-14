/** GET: OCM heatmap data (role x area grid) */

import { NextResponse } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { getOcmHeatmap } from "@/lib/db/registers";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const { user } = access;
  const heatmap = await getOcmHeatmap(assessmentId);

  return NextResponse.json({ data: heatmap });
}
