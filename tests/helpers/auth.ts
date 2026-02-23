/**
 * Authentication mock helpers for testing.
 * Provides mock session objects for each of the 11 platform roles.
 */

export type PlatformRole =
  | "platform_admin"
  | "partner_lead"
  | "consultant"
  | "project_manager"
  | "executive"
  | "functional_head"
  | "process_owner"
  | "it_lead"
  | "data_migration_lead"
  | "change_manager"
  | "viewer";

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

/** Create mock sessions for ALL 11 platform roles */
export function createAllRoleSessions(orgId = DEFAULT_ORG_ID): Record<PlatformRole, MockSession> {
  const roles: PlatformRole[] = [
    "platform_admin", "partner_lead", "consultant", "project_manager",
    "executive", "functional_head", "process_owner", "it_lead",
    "data_migration_lead", "change_manager", "viewer",
  ];
  return Object.fromEntries(
    roles.map((role) => [
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

/** All platform roles as array */
export const ALL_ROLES: PlatformRole[] = [
  "platform_admin", "partner_lead", "consultant", "project_manager",
  "executive", "functional_head", "process_owner", "it_lead",
  "data_migration_lead", "change_manager", "viewer",
];

/** Roles that can write (non-viewer) */
export const WRITE_ROLES: PlatformRole[] = ALL_ROLES.filter((r) => r !== "viewer");

/** Roles that can classify steps */
export const CLASSIFY_ROLES: PlatformRole[] = [
  "consultant", "process_owner", "functional_head",
];

/** Roles that can sign off */
export const SIGNOFF_ROLES: PlatformRole[] = [
  "executive", "partner_lead",
];
