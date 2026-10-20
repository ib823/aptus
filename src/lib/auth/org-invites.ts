/**
 * Who may see an organization's members and invite into it.
 *
 * ONE ANSWER FOR THE ROUTES AND THE SCREENS. The member list, the invitation
 * list, the invite and the revoke each carried their own inline role list, and
 * the screens a third; adding the sandbox developer (roadmap P0.13) to four
 * hand-written lists is how one of them gets missed. The routes and the
 * CoreEdge members screen (/coreedge/members) all ask here.
 *
 * THE SANDBOX DEVELOPER INVITES SANDBOX DEVELOPERS, AND NOTHING ELSE. A
 * workspace is self-service, so whoever owns one can bring colleagues into
 * it; what it can never do is mint a role with more reach than its own. The
 * hierarchy check (`canAssignRole`) already refuses anything above it, and
 * `viewer` sits below it — so the rule is stated outright rather than left to
 * where a number happens to fall.
 *
 * A WORKSPACE'S PENDING INVITATIONS COUNT AGAINST ITS SEATS. Seats used to
 * count active members only, so an invitation was free until accepted and an
 * open sign-up could have mailed any number of addresses from this host's
 * domain. For a sandbox developer's workspace the pending ones count too.
 * Other organizations keep the rule they had.
 */

import { isAdminRoleName, mapLegacyRole } from "@/lib/auth/role-migration";
import { canAssignRole } from "@/lib/auth/role-permissions";
import { ROLE_HIERARCHY, type UserRole } from "@/types/assessment";

interface Member {
  readonly role: string;
  readonly organizationId: string | null;
}

/** Roles that administer the members of their OWN organization. */
const ORG_MEMBER_MANAGERS: ReadonlySet<UserRole> = new Set<UserRole>([
  "partner_lead",
  "client_admin",
  "sandbox_developer",
]);

/** Roles that may read their own organization's member list. */
const ORG_MEMBER_VIEWERS: ReadonlySet<UserRole> = new Set<UserRole>([
  ...ORG_MEMBER_MANAGERS,
  "consultant",
]);

/** Invite into, and revoke the pending invitations of, this organization. */
export function mayManageOrgMembers(user: Member, orgId: string): boolean {
  if (isAdminRoleName(user.role)) return true;
  return ORG_MEMBER_MANAGERS.has(mapLegacyRole(user.role)) && user.organizationId === orgId;
}

/** Read this organization's member list. */
export function mayViewOrgMembers(user: Member, orgId: string): boolean {
  if (isAdminRoleName(user.role)) return true;
  return ORG_MEMBER_VIEWERS.has(mapLegacyRole(user.role)) && user.organizationId === orgId;
}

/**
 * Why this inviter may not invite this role, or null when they may.
 *
 * The hierarchy first (a role above your own), then the sandbox developer's
 * own rule (its own role only).
 */
export function refuseInviteRole(inviterRole: string, targetRole: string): string | null {
  if (!canAssignRole(inviterRole, targetRole)) return "Cannot invite a role above your own level";
  if (mapLegacyRole(inviterRole) === "sandbox_developer" && mapLegacyRole(targetRole) !== "sandbox_developer") {
    return "A developer workspace can invite sandbox developers only";
  }
  return null;
}

/** The roles an inviter may choose from, highest first — for the invite form. */
export function invitableRoles(inviterRole: string): UserRole[] {
  return (Object.keys(ROLE_HIERARCHY) as UserRole[])
    .filter((role) => refuseInviteRole(inviterRole, role) === null)
    .sort((a, b) => ROLE_HIERARCHY[b] - ROLE_HIERARCHY[a]);
}

/** Do this inviter's pending invitations count against the seats? */
export function pendingInvitesCountAsSeats(inviterRole: string): boolean {
  return mapLegacyRole(inviterRole) === "sandbox_developer";
}

/**
 * Why accepting this invitation must not touch an EXISTING account, or null.
 *
 * Accepting overwrites the account's role and organization outright. Once
 * anyone can open a workspace and invite any address, that is a way to strip a
 * stranger's account of its role by getting them to click "accept" — the
 * platform administrator's included. Two narrow refusals, so every invitation
 * that worked before still works:
 *   · a platform administrator is never turned into anything else by an
 *     invitation (an admin changes roles, in /admin/users);
 *   · a developer workspace's invitation (sandbox developer) never replaces
 *     an account's different role.
 */
export function refuseAcceptForExistingAccount(existingRole: string, invitedRole: string): string | null {
  if (isAdminRoleName(existingRole) && !isAdminRoleName(invitedRole)) {
    return "This invitation would remove your platform administrator role, so it cannot be accepted with this account.";
  }
  if (mapLegacyRole(invitedRole) === "sandbox_developer" && mapLegacyRole(existingRole) !== "sandbox_developer") {
    return "This account already has a role on this host, and a developer workspace invitation would replace it. Ask the workspace to invite another address.";
  }
  return null;
}
