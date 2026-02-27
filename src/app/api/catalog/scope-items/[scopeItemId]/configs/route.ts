/** GET: Config activities for a scope item */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { getConfigsForScopeItem } from "@/lib/db/process-steps";
import { prisma } from "@/lib/db/prisma";
import { getCountryName } from "@/constants/countries";
import { ERROR_CODES } from "@/types/api";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scopeItemId: string }> },
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

  const { scopeItemId } = await params;
  const assessmentId = request.nextUrl.searchParams.get("assessmentId");

  let configs = await getConfigsForScopeItem(scopeItemId);

  // REM-03: Filter configs by country if assessmentId is provided
  if (assessmentId) {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { country: true },
    });

    if (assessment?.country) {
      const countryName = getCountryName(assessment.country);
      configs = configs.filter((config) => {
        const cs = (config as Record<string, unknown>).countrySpecific as string | null | undefined;
        if (!cs || cs === "" || cs === "Global") return true;
        // If countrySpecific contains the country name, include it
        if (cs.toLowerCase().includes(countryName.toLowerCase())) return true;
        if (cs.toLowerCase().includes(assessment.country.toLowerCase())) return true;
        return false;
      });
    }
  }

  return NextResponse.json({ data: configs });
}
