/**
 * ABeam Workbench — Consultant-side RBAC for the presales dashboard.
 *
 * The portal already authenticates via NextAuth + session bridge. This
 * module decides what each role is allowed to do INSIDE the presales
 * surface. The matrix is intentionally small and explicit — adding a new
 * role means deciding its exact action set, not extending a wildcard.
 *
 * Roles authorized for any presales access:
 *   consultant        — can do everything except admin-flagged operations
 *   partner_lead      — same as consultant
 *   platform_admin    — superset; can perform admin operations like
 *                       reissuing grants on closed bundles or hard-delete
 *                       (PDPA erasure path)
 *   executive_sponsor — read-only; views bundles + audit; cannot create,
 *                       send, revoke, or extend
 *   project_manager   — read-only (same surface as executive_sponsor);
 *                       UI shows write affordances as "View only" tooltips
 *
 * Anyone else → 403 from the layout-level gate.
 */

import { isAdminRole } from '@/lib/auth/permissions';

export type PresalesRole =
  | 'consultant'
  | 'partner_lead'
  | 'platform_admin'
  | 'executive_sponsor'
  | 'project_manager';

export type PresalesAction =
  | 'view'
  | 'create_bundle'
  | 'edit_bundle_draft'
  | 'send_bundle'
  | 'extend_bundle'
  | 'revoke_bundle'
  | 'reissue_grant'
  | 'submit_change_request'
  | 'admin_hard_delete'
  | 'preview_as_client';

const MATRIX: Record<PresalesRole, ReadonlySet<PresalesAction>> = {
  consultant: new Set<PresalesAction>([
    'view',
    'create_bundle',
    'edit_bundle_draft',
    'send_bundle',
    'extend_bundle',
    'revoke_bundle',
    'reissue_grant',
    'submit_change_request',
    'preview_as_client',
  ]),
  partner_lead: new Set<PresalesAction>([
    'view',
    'create_bundle',
    'edit_bundle_draft',
    'send_bundle',
    'extend_bundle',
    'revoke_bundle',
    'reissue_grant',
    'submit_change_request',
    'preview_as_client',
  ]),
  platform_admin: new Set<PresalesAction>([
    'view',
    'create_bundle',
    'edit_bundle_draft',
    'send_bundle',
    'extend_bundle',
    'revoke_bundle',
    'reissue_grant',
    'submit_change_request',
    'preview_as_client',
    'admin_hard_delete',
  ]),
  executive_sponsor: new Set<PresalesAction>(['view', 'preview_as_client']),
  project_manager: new Set<PresalesAction>(['view', 'preview_as_client']),
};

const ALLOWED_TO_ENTER = new Set<PresalesRole>([
  'consultant',
  'partner_lead',
  'platform_admin',
  'executive_sponsor',
  'project_manager',
]);

export function canAccessPresales(role: string | null | undefined): role is PresalesRole {
  return !!role && ALLOWED_TO_ENTER.has(role as PresalesRole);
}

export function canPerformPresalesAction(
  role: string | null | undefined,
  action: PresalesAction,
): boolean {
  if (!canAccessPresales(role)) return false;
  return MATRIX[role].has(action);
}

export function isReadOnlyRole(role: string | null | undefined): boolean {
  return role === 'executive_sponsor' || role === 'project_manager';
}

/**
 * A non-admin user with no `organizationId` has no tenant to scope presales
 * queries to. Several routes previously dropped the org filter entirely for such
 * users (`...(user.organizationId ? {...} : {})`), which silently matched bundles
 * across ALL organizations. Callers must reject these users before querying.
 * platform_admin is exempt: a global admin may legitimately carry a null org and
 * is allowed to act across tenants.
 */
export function lacksTenantScope(user: {
  organizationId: string | null;
  role: string | null | undefined;
}): boolean {
  return !user.organizationId && !isAdminRole(user.role ?? '');
}
