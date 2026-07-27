import type { User } from "@prisma/client";

import { ALL_USER_ROLES } from "@/types/assessment";

let counter = 0;
const nextId = () => `test-${++counter}`;

type UserOverrides = Partial<User>;

function createBase(overrides: UserOverrides = {}): User {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    email: overrides.email ?? `user-${id}@example.com`,
    emailVerified: overrides.emailVerified ?? now,
    name: overrides.name ?? `Test User ${id}`,
    image: overrides.image ?? null,
    role: overrides.role ?? "consultant",
    organizationId: overrides.organizationId ?? null,
    isActive: overrides.isActive ?? true,
    avatarUrl: overrides.avatarUrl ?? null,
    mfaEnabled: overrides.mfaEnabled ?? false,
    lastLoginAt: overrides.lastLoginAt ?? null,
    lastLoginIp: overrides.lastLoginIp ?? null,
    loginCount: overrides.loginCount ?? 0,
    invitedBy: overrides.invitedBy ?? null,
    invitedAt: overrides.invitedAt ?? null,
    displayRole: overrides.displayRole ?? null,
    jobTitle: overrides.jobTitle ?? null,
    department: overrides.department ?? null,
    phone: overrides.phone ?? null,
    lastActiveAt: overrides.lastActiveAt ?? null,
    deactivatedAt: overrides.deactivatedAt ?? null,
    deactivatedBy: overrides.deactivatedBy ?? null,
    deactivationReason: overrides.deactivationReason ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export function create(overrides: UserOverrides = {}): User {
  return createBase(overrides);
}

export function createMany(count: number, overrides: UserOverrides = {}): User[] {
  return Array.from({ length: count }, () => createBase(overrides));
}

export function createForRole(
  role: string,
  orgId: string,
  overrides: UserOverrides = {},
): User {
  return createBase({
    role,
    organizationId: orgId,
    displayRole: role.charAt(0).toUpperCase() + role.slice(1),
    ...overrides,
  });
}

export function createAllRoles(
  orgId: string,
  overrides: UserOverrides = {},
): Record<string, User> {
  // Derived, not listed. The hand-written version carried `partner_admin`,
  // `partner_manager` and `client_sponsor` — none of which are `UserRole`
  // values — and omitted five that are, including `support`. A factory that
  // manufactures roles the application cannot produce tests nothing.
  const roles: readonly string[] = ALL_USER_ROLES;
  const result: Record<string, User> = {};
  for (const role of roles) {
    result[role] = createForRole(role, orgId, overrides);
  }
  return result;
}

export function createWithMagicLink(
  orgId: string,
  overrides: UserOverrides = {},
): User {
  return createBase({
    organizationId: orgId,
    role: "viewer",
    emailVerified: null,
    mfaEnabled: false,
    loginCount: 0,
    lastLoginAt: null,
    ...overrides,
  });
}

export function createWithSSO(
  orgId: string,
  overrides: UserOverrides = {},
): User {
  return createBase({
    organizationId: orgId,
    role: "consultant",
    emailVerified: new Date(),
    mfaEnabled: true,
    lastLoginAt: new Date(),
    loginCount: 10,
    ...overrides,
  });
}

export function createExpiredViewer(
  assessmentId: string,
  overrides: UserOverrides = {},
): User {
  return createBase({
    role: "viewer",
    isActive: false,
    deactivatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    deactivatedBy: "system",
    deactivationReason: `Assessment ${assessmentId} access expired`,
    emailVerified: null,
    mfaEnabled: false,
    ...overrides,
  });
}
