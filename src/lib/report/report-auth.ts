/** Shared auth + assessment validation for report endpoints */

import { NextResponse } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { ERROR_CODES } from "@/types/api";
import type { SessionUser } from "@/types/assessment";

interface AuthResult {
  user: SessionUser;
  assessment: { id: string; companyName: string; status: string; organizationId: string };
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
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

  const { user, assessment } = access;

  if (requireCompleted) {
    const allowedStatuses = ["completed", "reviewed", "signed_off", "pending_validation", "validated", "pending_sign_off", "handed_off", "archived"];
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
