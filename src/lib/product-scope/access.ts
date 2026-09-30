import type { SessionUser } from "@/types/assessment";
import { isAdminRole, isMfaRequired } from "@/lib/auth/permissions";

/** Partner-source records require an ABeam admin session with MFA satisfied. */
export function canViewRestrictedScope(user: SessionUser | null): boolean {
  return Boolean(user && isAdminRole(user.role) && !isMfaRequired(user));
}
