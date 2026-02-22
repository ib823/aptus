/** GET: Get impact preview for a scope item */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { getScopeItemImpact } from "@/lib/db/scope-items";
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

  // params.id is the assessment id (unused here but required by route structure)
  await params;

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
