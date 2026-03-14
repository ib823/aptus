/** GET: All scope items with selection status for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { getScopeItemsWithSelections } from "@/lib/db/scope-items";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) return access;
  const { user } = access;
  const scopeItems = await getScopeItemsWithSelections(id);

  return NextResponse.json({ data: scopeItems });
}
