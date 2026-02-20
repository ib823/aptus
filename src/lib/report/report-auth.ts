/** Shared auth + assessment validation for report endpoints */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { SessionUser } from "@/types/assessment";

interface AuthResult {
  user: SessionUser;
  assessment: { id: string; companyName: string; status: string };
}

/**
 * Authenticate user and validate assessment exists + status for report endpoints.
 * Returns error NextResponse if validation fails, or the user + assessment on success.
 * @param requireCompleted If true, requires status completed/reviewed/signed_off (default true)
 */
export async function authenticateForReport(
  assessmentId: string,
  requireCompleted = true,
): Promise<AuthResult | NextResponse> {
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

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, companyName: true, status: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  if (requireCompleted) {
    const allowedStatuses = ["completed", "reviewed", "signed_off"];
    if (!allowedStatuses.includes(assessment.status)) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Assessment must be completed before generating reports" } },
        { status: 400 },
      );
    }
  }

  return { user, assessment };
}

/** Check if result is an error response */
export function isErrorResponse(result: AuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
