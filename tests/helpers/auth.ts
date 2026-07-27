/**
 * Authentication mock helpers for testing.
 *
 * THESE USE THE REAL `UserRole`. They used to declare their own `PlatformRole`
 * union, which had drifted badly: it carried `executive`, `functional_head` and
 * `change_manager` — none of which exist in the product — and lacked
 * `data_migration_lead`'s successors and `support`. A fixture vocabulary that
 * disagrees with production is a fixture that can prove a role safe which the
 * application has never heard of.
 */

import { ROLE_CAPABILITIES } from "@/lib/auth/role-permissions";
import { ALL_USER_ROLES, type UserRole } from "@/types/assessment";

export type PlatformRole = UserRole;

export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  organizationId: string;
  isActive: boolean;
  mfaEnabled: boolean;
  mfaMethod: string;
}

export interface MockSession {
  user: MockUser;
  token: string;
  expiresAt: Date;
  mfaVerified: boolean;
}

const DEFAULT_ORG_ID = "test-org-001";

/** Create a mock user for a given role */
export function createMockUser(
  role: PlatformRole,
  overrides: Partial<MockUser> = {}
): MockUser {
  return {
    id: `test-user-${role}`,
    email: `${role.replace(/_/g, ".")}@test.example.com`,
    name: `Test ${role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
    role,
    organizationId: DEFAULT_ORG_ID,
    isActive: true,
    mfaEnabled: false,
    mfaMethod: "none",
    ...overrides,
  };
}

/** Create a mock session for a given role */
export function createMockSession(
  role: PlatformRole,
  overrides: Partial<MockSession> = {}
): MockSession {
  return {
    user: createMockUser(role, overrides.user as Partial<MockUser>),
    token: `test-token-${role}-${Date.now()}`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h from now
    mfaVerified: false,
    ...overrides,
  };
}

/**
 * Mock sessions for every role, derived from `ALL_USER_ROLES`.
 *
 * The previous version hand-listed eleven names, four of which were not roles.
 * It had no callers, so nothing noticed.
 */
export function createAllRoleSessions(orgId = DEFAULT_ORG_ID): Record<PlatformRole, MockSession> {
  return Object.fromEntries(
    ALL_USER_ROLES.map((role) => [
      role,
      createMockSession(role, { user: createMockUser(role, { organizationId: orgId }) }),
    ])
  ) as Record<PlatformRole, MockSession>;
}

/** Create an expired session */
export function createExpiredSession(role: PlatformRole): MockSession {
  return createMockSession(role, {
    expiresAt: new Date(Date.now() - 1000), // Already expired
  });
}

/** Create an unauthenticated request context (no session) */
export function createUnauthenticatedContext() {
  return { user: null, session: null, token: null };
}

/** Create a forged JWT token (for security testing) */
export function createForgedToken(role: PlatformRole): string {
  return `forged-jwt-${role}-${Date.now()}`;
}

/** Create a cross-tenant user (belongs to different org) */
export function createCrossTenantUser(
  role: PlatformRole,
  foreignOrgId = "foreign-org-999"
): MockUser {
  return createMockUser(role, { organizationId: foreignOrgId });
}

/**
 * All platform roles.
 *
 * DERIVED. The hand-written version listed `executive`, `functional_head` and
 * `change_manager` — none of which are roles — and omitted `solution_architect`,
 * `client_admin`, `executive_sponsor` and `support`, which are. The security
 * suite imports this list to assert that non-sign-off roles cannot sign off, so
 * for four real roles that assertion was never made, and for three imaginary
 * ones it was made about nothing.
 */
export const ALL_ROLES: PlatformRole[] = [...ALL_USER_ROLES];

/**
 * Roles that may edit assessment content, and roles that may sign off.
 *
 * Taken from the production capability map rather than restated. The previous
 * `WRITE_ROLES` was "everything except viewer", which is wrong in the direction
 * that matters — it asserted write access for six roles that do not have it,
 * `support` among them.
 */
export const WRITE_ROLES: PlatformRole[] = ALL_ROLES.filter(
  (r) => ROLE_CAPABILITIES[r].canEditStepResponses,
);

export const SIGNOFF_ROLES: PlatformRole[] = ALL_ROLES.filter(
  (r) => ROLE_CAPABILITIES[r].canSignOff,
);
