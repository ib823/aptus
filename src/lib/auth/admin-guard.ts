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
 * Authenticate, and nothing more — signed in, and past MFA if the organization
 * demands it.
 *
 * SPLIT OUT OF `requireAdmin` rather than copied, so there is one definition of
 * "this caller is who they say they are" and its two answers (401 not signed
 * in, 403 MFA required) cannot drift between callers.
 *
 * It exists for a route whose gate DEPENDS ON THE REQUEST: probe-all may be run
 * by a builder against their own organization's SAP connection, but only by a
 * platform admin against a deployment-wide tenant — and which of those it is
 * cannot be known until the body has been parsed and the tenant resolved.
 * Authenticating first and deciding the role rule afterwards is the only honest
 * order; `requireAdmin` still exists unchanged for every route whose answer is
 * the same before the body is read.
 */
export async function requireAuthenticated(): Promise<AdminAuthResult | NextResponse> {
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

  return { user };
}

/**
 * Authenticate user and verify admin role.
 * Supports both legacy "admin" and new "platform_admin" role.
 * Returns error NextResponse if validation fails, or the user on success.
 */
export async function requireAdmin(): Promise<AdminAuthResult | NextResponse> {
  const authenticated = await requireAuthenticated();
  if (isAdminError(authenticated)) return authenticated;
  const { user } = authenticated;

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
