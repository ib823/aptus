/**
 * CoreEdge Console — workspace RBAC.
 *
 * The Console is one app with three RBAC-gated workspaces. v1 builds only
 * Developer Studio; Operations Center and Control Tower are declared here so the
 * rail can render them locked (matching the approved design) without pretending
 * they exist.
 *
 * ROLE MAPPING (resolved, do not invent new roles): the design names its personas
 * "Developer" / "Support" / "Platform Admin", but this codebase's real `UserRole`
 * union has no `developer` or `support` value. v1 therefore maps:
 *
 *   Developer      → `consultant`      (the existing builder persona)
 *   Platform Admin → `platform_admin`
 *   Support        → v2 (Operations Center is not built in v1)
 *
 * `platform_admin` may OPEN Developer Studio in an oversight capacity — this
 * resolves the approved design's internal contradiction, where the rail unlocked
 * Studio for an admin but the content walled it. Admin access is read-oriented:
 * governance mutations remain the builder's action. Every other role lands on the
 * role-gated empty state.
 */

import { isAdminRole } from "@/lib/auth/permissions";

export type StudioWorkspace = "developer-studio" | "operations-center" | "control-tower";

export interface WorkspaceDescriptor {
  key: StudioWorkspace;
  label: string;
  /** Route the workspace opens at, or null when it is not built yet (v2). */
  href: string | null;
  /** False → render locked (🔒) in the rail rather than hiding it. */
  availableInV1: boolean;
}

export const WORKSPACES: readonly WorkspaceDescriptor[] = [
  { key: "developer-studio", label: "Developer Studio", href: "/studio", availableInV1: true },
  { key: "operations-center", label: "Operations Center", href: null, availableInV1: false },
  { key: "control-tower", label: "Control Tower", href: null, availableInV1: false },
] as const;

/** The builder persona. The design calls this role "Developer". */
export function isStudioBuilder(role: string | null | undefined): boolean {
  return role === "consultant";
}

/**
 * May this role open Developer Studio at all? Builders and platform admins can;
 * everyone else gets the role-gated empty state (never a 404 — the section
 * exists, the caller simply is not entitled to it).
 */
export function canAccessStudio(role: string | null | undefined): boolean {
  if (!role) return false;
  return isStudioBuilder(role) || isAdminRole(role);
}

/**
 * May this role perform a governance MUTATION inside Studio (register a solution,
 * define an interface, decide a grant)? Builders only — an admin's Studio access
 * is oversight. Admin-specific governance lives in Control Tower (v2).
 */
export function canMutateStudio(role: string | null | undefined): boolean {
  return isStudioBuilder(role);
}

/** Which workspaces this role may open. Others render locked in the rail. */
export function accessibleWorkspaces(role: string | null | undefined): StudioWorkspace[] {
  if (!role) return [];
  if (isAdminRole(role)) return WORKSPACES.map((w) => w.key);
  if (isStudioBuilder(role)) return ["developer-studio"];
  return [];
}

/**
 * A non-admin with no `organizationId` has no tenant to scope Studio queries to.
 * Every Studio table is organization-anchored, so such a user must be rejected
 * BEFORE any query runs — never allowed to fall through to an unscoped read.
 * platform_admin is exempt: a global admin may legitimately carry a null org.
 */
export function lacksStudioTenantScope(user: {
  organizationId: string | null;
  role: string | null | undefined;
}): boolean {
  return !user.organizationId && !isAdminRole(user.role ?? "");
}
