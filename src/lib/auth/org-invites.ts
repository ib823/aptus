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
 * Other organizations keep the rule they had. Because revoking frees a seat,
 * a sandbox developer's sends are also held to a daily budget
 * (`inviteSendBudget`), and it manages sandbox developer invitations only
 * (`managedInvitationRole`).
 *
 * …AND ONLY IN A DEVELOPER WORKSPACE (review round 2). The role's member
 * rights were the role's wherever it sat, so a sandbox developer a client
 * admin had placed in a customer organization could invite outsiders into it,
 * and each of them could read the customer's member list and Studio. They are
 * the WORKSPACE's rights: an organization in which nobody, member or pending
 * invitee, holds any other role (`isDeveloperWorkspace`). Anywhere else the
 * role invites nobody and sees no member list, as before P0.13.
 */

import { isAdminRoleName, mapLegacyRole } from "@/lib/auth/role-migration";
import { canAssignRole } from "@/lib/auth/role-permissions";
import { prisma } from "@/lib/db/prisma";
import { ROLE_HIERARCHY, type UserRole } from "@/types/assessment";

interface Member {
  readonly role: string;
  readonly organizationId: string | null;
}

/** What the member rules need to know about the organization itself. */
export interface OrgFacts {
  /** Nobody in it, member or pending invitee, holds a role but sandbox_developer. */
  readonly developerWorkspace: boolean;
}

/** Roles that administer the members of their OWN organization. */
const ORG_MEMBER_MANAGERS: ReadonlySet<UserRole> = new Set<UserRole>(["partner_lead", "client_admin"]);

/** Roles that may read their own organization's member list. */
const ORG_MEMBER_VIEWERS: ReadonlySet<UserRole> = new Set<UserRole>([...ORG_MEMBER_MANAGERS, "consultant"]);

/** Does this member's right depend on whether the organization is a workspace? */
function holdsWorkspaceRights(user: Member, orgId: string): boolean {
  return !isAdminRoleName(user.role) && mapLegacyRole(user.role) === "sandbox_developer" && user.organizationId === orgId;
}

/** Invite into, and revoke the pending invitations of, this organization. */
export function mayManageOrgMembers(user: Member, orgId: string, org: OrgFacts): boolean {
  if (isAdminRoleName(user.role)) return true;
  if (holdsWorkspaceRights(user, orgId)) return org.developerWorkspace;
  return ORG_MEMBER_MANAGERS.has(mapLegacyRole(user.role)) && user.organizationId === orgId;
}

/** Read this organization's member list. */
export function mayViewOrgMembers(user: Member, orgId: string, org: OrgFacts): boolean {
  if (isAdminRoleName(user.role)) return true;
  if (holdsWorkspaceRights(user, orgId)) return org.developerWorkspace;
  return ORG_MEMBER_VIEWERS.has(mapLegacyRole(user.role)) && user.organizationId === orgId;
}

/**
 * Is this organization a developer workspace?
 *
 * There is no column that says so, and none is needed: a workspace is created
 * with one sandbox developer in it (lib/auth/developer-workspace.ts), and a
 * sandbox developer can invite only sandbox developers. So an organization in
 * which some member or pending invitee holds any other role — a customer's,
 * a partner's — is not one, whatever it once was. A deactivated member counts:
 * the organization is still theirs.
 */
export async function isDeveloperWorkspace(organizationId: string): Promise<boolean> {
  const [members, invitations] = await Promise.all([
    prisma.user.count({ where: { organizationId, role: { not: "sandbox_developer" } } }),
    prisma.orgInvitation.count({ where: { organizationId, status: "pending", role: { not: "sandbox_developer" } } }),
  ]);
  return members === 0 && invitations === 0;
}

/**
 * This member's rights over this organization's members, reading the
 * organization only when the answer depends on it (a sandbox developer in its
 * own organization). What the routes and the members screen ask.
 */
export async function orgMemberRights(
  user: Member,
  orgId: string,
): Promise<{ readonly manage: boolean; readonly view: boolean }> {
  const org: OrgFacts = {
    developerWorkspace: holdsWorkspaceRights(user, orgId) ? await isDeveloperWorkspace(orgId) : false,
  };
  return { manage: mayManageOrgMembers(user, orgId, org), view: mayViewOrgMembers(user, orgId, org) };
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
 * How many sandbox developer invitations an organization may SEND in any 24
 * hours when a sandbox developer sends one, whatever became of them.
 *
 * THE SEAT RULE ALONE WAS NOT A SEND LIMIT. Revoking an invitation frees its
 * seat at once, so invite → revoke → invite mailed any number of addresses
 * from this host's domain, each carrying the inviter's own free-text name and
 * workspace name. This counts every invitation created in the window —
 * pending, revoked, expired or accepted — so revoking frees a seat but never
 * a send. Ten is a team's worth in a day; an administrator who needs more
 * sends them (they are not limited by this).
 */
export const DEVELOPER_WORKSPACE_INVITES_PER_DAY = 10;
export const DEVELOPER_WORKSPACE_INVITE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The send budget this inviter is held to, or null when none applies. */
export function inviteSendBudget(inviterRole: string): number | null {
  return mapLegacyRole(inviterRole) === "sandbox_developer" ? DEVELOPER_WORKSPACE_INVITES_PER_DAY : null;
}

/**
 * The invitations this member may see and revoke, as a filter on their role,
 * or null for every invitation in the organization.
 *
 * A SANDBOX DEVELOPER MANAGES SANDBOX DEVELOPER INVITATIONS ONLY. In its own
 * workspace that is all there is. But an organization's administrators can
 * invite a sandbox developer into a real customer organization, and
 * `mayManageOrgMembers` alone then let it list every pending invitation —
 * emails, roles, inviter — and revoke the client admin's invitation of the
 * next client admin. It manages what it could have sent, and nothing else.
 */
export function managedInvitationRole(user: Member): UserRole | null {
  if (isAdminRoleName(user.role)) return null;
  return mapLegacyRole(user.role) === "sandbox_developer" ? "sandbox_developer" : null;
}

/** May this member revoke this particular invitation (already in their org)? */
export function mayManageInvitation(user: Member, invitation: { readonly role: string }): boolean {
  const only = managedInvitationRole(user);
  return only === null || mapLegacyRole(invitation.role) === only;
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
 *     an account's different role;
 *   · a developer workspace's invitation never REACTIVATES a deactivated
 *     account (review round 2). Accepting sets isActive, and the invitee's own
 *     mailbox is all it takes, so a peer in the workspace could invite back an
 *     account a platform admin had deactivated, and its owner accept. Only an
 *     administrator brings a deactivated account back. A sandbox developer can
 *     send no other role (`refuseInviteRole`), so the invited role is the
 *     inviter's too.
 */
export function refuseAcceptForExistingAccount(
  existingRole: string,
  invitedRole: string,
  existingIsActive: boolean,
): string | null {
  if (isAdminRoleName(existingRole) && !isAdminRoleName(invitedRole)) {
    return "This invitation would remove your platform administrator role, so it cannot be accepted with this account.";
  }
  if (mapLegacyRole(invitedRole) === "sandbox_developer" && mapLegacyRole(existingRole) !== "sandbox_developer") {
    return "This account already has a role on this host, and a developer workspace invitation would replace it. Ask the workspace to invite another address.";
  }
  if (mapLegacyRole(invitedRole) === "sandbox_developer" && !existingIsActive) {
    return "This account has been deactivated, and a developer workspace invitation cannot reactivate it. Ask an administrator.";
  }
  return null;
}

/**
 * Should this invitation be MAILED to its address?
 *
 * A SANDBOX DEVELOPER'S INVITATION MAILS ONLY AN ADDRESS WITH NO ACCOUNT
 * (review round 2). The invite route told an administrator "User already
 * belongs to another organization", and handing that answer to anyone with a
 * workspace made it an oracle for which addresses are registered on this
 * host, free of charge because only created invitations spent the budget. So
 * for a sandbox developer the route answers every address alike — creates the
 * invitation, spends a seat and a send — and simply does not mail one whose
 * account it could never move: an account elsewhere, a deactivated one, one
 * with another role (`refuseAcceptForExistingAccount` would refuse it anyway),
 * or a member already here. Without the email nobody holds the token, so
 * nothing can be accepted. Administrators keep the answer they had.
 */
export function mailsInvitation(inviterRole: string, addressHasAccount: boolean): boolean {
  return mapLegacyRole(inviterRole) !== "sandbox_developer" || !addressHasAccount;
}
