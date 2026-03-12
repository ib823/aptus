import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { verifyAssessmentAccess } from "@/lib/auth/verify-assessment-access";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { SessionUser } from "@/types/assessment";

interface AssessmentAccessOptions {
  requireMfa?: boolean;
}

interface AssessmentAccessResult {
  user: SessionUser;
  assessment: {
    id: string;
    companyName: string;
    organizationId: string;
    status: string;
  };
}

export async function requireAssessmentAccess(
  assessmentId: string,
  options: AssessmentAccessOptions = {},
): Promise<AssessmentAccessResult | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if ((options.requireMfa ?? true) && isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: {
      id: true,
      companyName: true,
      organizationId: true,
      status: true,
    },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const hasAccess = await verifyAssessmentAccess(
    user,
    assessmentId,
    assessment.organizationId,
  );
  if (!hasAccess) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "You do not have access to this assessment" } },
      { status: 403 },
    );
  }

  return { user, assessment };
}

export function isAssessmentAccessError(
  result: AssessmentAccessResult | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
