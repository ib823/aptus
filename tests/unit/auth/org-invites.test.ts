/**
 * Who may see and invite an organization's members (lib/auth/org-invites.ts,
 * roadmap P0.13). One answer for the routes and the members screen.
 */

import { describe, expect, it } from "vitest";

import {
  invitableRoles,
  mayManageOrgMembers,
  mayViewOrgMembers,
  pendingInvitesCountAsSeats,
  refuseAcceptForExistingAccount,
  refuseInviteRole,
} from "@/lib/auth/org-invites";
import { ALL_USER_ROLES } from "@/types/assessment";

const ORG = "org-1";

describe("managing an organization's members", () => {
  it("a platform admin manages any organization", () => {
    expect(mayManageOrgMembers({ role: "platform_admin", organizationId: null }, ORG)).toBe(true);
  });

  it.each(["partner_lead", "client_admin", "sandbox_developer"])("%s manages its own organization only", (role) => {
    expect(mayManageOrgMembers({ role, organizationId: ORG }, ORG)).toBe(true);
    expect(mayManageOrgMembers({ role, organizationId: "org-2" }, ORG)).toBe(false);
    expect(mayManageOrgMembers({ role, organizationId: null }, ORG)).toBe(false);
  });

  it.each(["consultant", "viewer", "support", "project_manager"])("%s does not manage members", (role) => {
    expect(mayManageOrgMembers({ role, organizationId: ORG }, ORG)).toBe(false);
  });

  it("a consultant and a sandbox developer may read their own member list", () => {
    expect(mayViewOrgMembers({ role: "consultant", organizationId: ORG }, ORG)).toBe(true);
    expect(mayViewOrgMembers({ role: "sandbox_developer", organizationId: ORG }, ORG)).toBe(true);
    expect(mayViewOrgMembers({ role: "sandbox_developer", organizationId: "org-2" }, ORG)).toBe(false);
    expect(mayViewOrgMembers({ role: "viewer", organizationId: ORG }, ORG)).toBe(false);
  });
});

describe("which roles an inviter may offer", () => {
  it("a sandbox developer invites sandbox developers and nothing else", () => {
    expect(invitableRoles("sandbox_developer")).toEqual(["sandbox_developer"]);
    for (const role of ALL_USER_ROLES.filter((r) => r !== "sandbox_developer")) {
      expect(refuseInviteRole("sandbox_developer", role), role).not.toBeNull();
    }
  });

  it("nobody below a sandbox developer can mint one", () => {
    expect(refuseInviteRole("viewer", "sandbox_developer")).not.toBeNull();
  });

  it("other inviters keep the hierarchy rule they had", () => {
    expect(refuseInviteRole("partner_lead", "consultant")).toBeNull();
    expect(refuseInviteRole("partner_lead", "sandbox_developer")).toBeNull();
    expect(refuseInviteRole("client_admin", "platform_admin")).toMatch(/above your own level/);
    expect(invitableRoles("platform_admin")[0]).toBe("platform_admin");
  });

  it("only a developer workspace counts pending invitations as seats", () => {
    expect(pendingInvitesCountAsSeats("sandbox_developer")).toBe(true);
    expect(pendingInvitesCountAsSeats("partner_lead")).toBe(false);
    expect(pendingInvitesCountAsSeats("platform_admin")).toBe(false);
  });
});

describe("accepting an invitation as an existing account", () => {
  it("never strips a platform administrator's role", () => {
    expect(refuseAcceptForExistingAccount("platform_admin", "sandbox_developer")).toMatch(/platform administrator/);
    expect(refuseAcceptForExistingAccount("platform_admin", "partner_lead")).toMatch(/platform administrator/);
    expect(refuseAcceptForExistingAccount("admin", "viewer")).not.toBeNull();
    expect(refuseAcceptForExistingAccount("platform_admin", "platform_admin")).toBeNull();
  });

  it("a developer workspace's invitation never replaces another role", () => {
    expect(refuseAcceptForExistingAccount("consultant", "sandbox_developer")).not.toBeNull();
    expect(refuseAcceptForExistingAccount("sandbox_developer", "sandbox_developer")).toBeNull();
  });

  it("every other invitation works as before", () => {
    expect(refuseAcceptForExistingAccount("consultant", "project_manager")).toBeNull();
    expect(refuseAcceptForExistingAccount("viewer", "partner_lead")).toBeNull();
  });
});
