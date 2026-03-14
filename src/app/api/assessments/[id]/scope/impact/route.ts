/** GET: Get impact preview for a scope item */

import { NextResponse, type NextRequest } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { getScopeItemImpact } from "@/lib/db/scope-items";
import { ERROR_CODES } from "@/types/api";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

  const scopeItemId = request.nextUrl.searchParams.get("scopeItemId");
  if (!scopeItemId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "scopeItemId query param required" } },
      { status: 400 },
    );
  }

  const impact = await getScopeItemImpact(scopeItemId);

  return NextResponse.json({ data: impact });
}
