/** Admin role guard for API routes */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, isAdminRole } from "@/lib/auth/permissions";
import { ERROR_CODES } from "@/types/api";
import type { SessionUser } from "@/types/assessment";

interface AdminAuthResult {
  user: SessionUser;
}

/**
 * Authenticate user and verify admin role.
 * Supports both legacy "admin" and new "platform_admin" role.
 * Returns error NextResponse if validation fails, or the user on success.
 */
export async function requireAdmin(): Promise<AdminAuthResult | NextResponse> {
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

  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Admin access required" } },
      { status: 403 },
    );
  }

  return { user };
}

/** Check if result is an error response */
export function isAdminError(result: AdminAuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
