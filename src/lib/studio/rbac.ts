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

/** The operations persona. Watches the running system; changes nothing about it. */
export function isSupport(role: string | null | undefined): boolean {
  return role === "support";
}

/**
 * May this role open the Operations Center? Its owner, plus admins for oversight.
 */
export function canAccessOperations(role: string | null | undefined): boolean {
  if (!role) return false;
  return isSupport(role) || isAdminRole(role);
}

/**
 * May this role open Control Tower?
 *
 * `isAdminRole` is `platform_admin` ONLY (see lib/auth/permissions), so the
 * read-only viewers are listed explicitly rather than inferred — a reader that
 * quietly widened to "any elevated role" is exactly the drift this file exists
 * to make visible.
 */
const CONTROL_TOWER_READERS: ReadonlySet<string> = new Set([
  "partner_lead",
  "executive_sponsor",
  "project_manager",
]);

export function canAccessControlTower(role: string | null | undefined): boolean {
  if (!role) return false;
  return isAdminRole(role) || CONTROL_TOWER_READERS.has(role);
}

/**
 * May this role act in Control Tower? Admin only.
 *
 * The one governance mutation there is the grant decision. Note this is a NEW
 * capability rather than a re-use: `canMutateStudio("platform_admin")` is
 * deliberately false, and stays false — Studio's mutations remain the builder's.
 */
export function canMutateControlTower(role: string | null | undefined): boolean {
  if (!role) return false;
  return isAdminRole(role);
}

/** Which workspaces this role may open. Others render locked in the rail. */
export function accessibleWorkspaces(role: string | null | undefined): StudioWorkspace[] {
  if (!role) return [];
  // DERIVED from WORKSPACES, never hand-listed: a fourth workspace must widen
  // admin access automatically, and a test pins this as an exact equality.
  if (isAdminRole(role)) return WORKSPACES.map((w) => w.key);

  const open: StudioWorkspace[] = [];
  if (canAccessStudio(role)) open.push("developer-studio");
  if (canAccessOperations(role)) open.push("operations-center");
  if (canAccessControlTower(role)) open.push("control-tower");
  return open;
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
