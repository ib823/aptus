import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { InviteMember } from "@/components/coreedge/actions/InviteMember";
import { OpsTable } from "@/components/coreedge/OpsTable";
import { invitableRoles, managedInvitationRole, orgMemberRights } from "@/lib/auth/org-invites";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ROLE_LABELS, type UserRole } from "@/types/assessment";

import { CoreEdgeShell } from "../CoreEdgeShell";

/**
 * Members — who is in this organization, who has been invited, and the form
 * that invites one more (roadmap P0.13).
 *
 * WHY THIS SCREEN IS HERE AND NOT IN THE PORTAL. The portal has a user
 * management page at /organization/users, and on a WORKBENCH_ONLY host — the
 * shared host developers sign up on — every portal page is redirected to
 * /workbench before it runs. So a developer workspace could be created and
 * never grow past one person without a database edit. /coreedge is reachable
 * on that host, renders for every signed-in user, and is where a developer
 * already works; the invitation email lands on /invitations/, which is
 * reachable too.
 *
 * NOT A SEVENTH PLACE IN THE RAIL. The rail is the six places and a test holds
 * it to them; this screen is reached from Home and from a developer's
 * onboarding step, and the rail shows Home as current.
 *
 * Who may see the members, who may invite, and which roles they may offer,
 * come from lib/auth/org-invites.ts — the same functions the member-list and
 * invite routes run, so the screen and the routes cannot disagree. A person
 * who may not invite still sees the form, blocked, with the reason; one who
 * may not see the member list is told so instead of being shown it.
 */

export const metadata: Metadata = { title: "Members" };

const NOT_A_MANAGER =
  "Inviting people is limited to your organization's administrators. Ask one of them to send the invitation.";

const NOT_A_VIEWER =
  "The member list is limited to your organization's administrators and builders. Ask one of them who is in it.";

function roleLabel(role: string): string {
  return ROLE_LABELS[role as UserRole] ?? role;
}

export default async function MembersPage(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  if (user.organizationId === null) {
    return (
      <CoreEdgeShell current="/coreedge" title="Members">
        <p className="max-w-prose text-sm text-ink-soft">
          Your account is not attached to an organization, so there are no members to show.
        </p>
      </CoreEdgeShell>
    );
  }

  const organizationId = user.organizationId;
  // The member directory is asked for exactly as the member-list route asks:
  // this layout renders for every signed-in role, and a viewer here was shown
  // every member's email while GET /api/organizations/[orgId]/users refused it.
  // A sandbox developer has both rights in its own workspace only.
  const { manage: mayInvite, view: mayView } = await orgMemberRights(user, organizationId);
  const onlyRole = managedInvitationRole(user);
  const now = new Date();

  const [members, invitations] = await Promise.all([
    mayView
      ? prisma.user.findMany({
          where: { organizationId },
          select: { id: true, name: true, email: true, role: true, isActive: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    mayInvite
      ? prisma.orgInvitation.findMany({
          where: {
            organizationId,
            status: "pending",
            expiresAt: { gt: now },
            ...(onlyRole ? { role: onlyRole } : {}),
          },
          select: { id: true, email: true, role: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const roles = invitableRoles(user.role).map((value) => ({ value, label: roleLabel(value) }));

  return (
    <CoreEdgeShell
      current="/coreedge"
      title="Members"
      subtitle="Who is in this organization, and who has been invited to join it"
    >
      {mayView ? (
        <OpsTable
          caption="Members of this organization"
          legend={<span>Everyone who can sign in to this organization</span>}
          rows={members}
          rowKey={(m) => m.id}
          empty={<p className="text-sm text-ink-soft">Nobody is in this organization yet.</p>}
          columns={[
            {
              key: "name",
              header: "Member",
              cell: (m) => (
                <span className="flex flex-col">
                  <span>{m.name}</span>
                  <span className="text-xs text-ink-muted">{m.email}</span>
                </span>
              ),
            },
            { key: "role", header: "Role", cell: (m) => roleLabel(m.role) },
            {
              key: "state",
              header: "Status",
              cell: (m) => (m.isActive ? "Active" : "Deactivated"),
            },
          ]}
        />
      ) : (
        <p className="max-w-prose text-sm text-ink-soft">{NOT_A_VIEWER}</p>
      )}

      {mayInvite ? (
        <OpsTable
          caption="Invitations waiting to be accepted"
          legend={<span>Each invitation lasts seven days</span>}
          rows={invitations}
          rowKey={(i) => i.id}
          empty={<p className="text-sm text-ink-soft">No invitations are waiting.</p>}
          columns={[
            { key: "email", header: "Invited", cell: (i) => i.email },
            { key: "role", header: "Role", cell: (i) => roleLabel(i.role) },
            {
              key: "expires",
              header: "Expires",
              cell: (i) => i.expiresAt.toISOString().slice(0, 10),
            },
          ]}
        />
      ) : null}

      <InviteMember
        organizationId={organizationId}
        roles={roles}
        blockedBecause={mayInvite ? null : NOT_A_MANAGER}
      />
    </CoreEdgeShell>
  );
}
