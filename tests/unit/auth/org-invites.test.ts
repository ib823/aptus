/**
 * Who may see and invite an organization's members (lib/auth/org-invites.ts,
 * roadmap P0.13). One answer for the routes and the members screen.
 */

import { describe, expect, it } from "vitest";

import {
  DEVELOPER_WORKSPACE_INVITES_PER_DAY,
  invitableRoles,
  inviteSendBudget,
  mailsInvitation,
  managedInvitationRole,
  mayManageInvitation,
  mayManageOrgMembers,
  mayViewOrgMembers,
  pendingInvitesCountAsSeats,
  refuseAcceptForExistingAccount,
  refuseInviteRole,
} from "@/lib/auth/org-invites";
import { ALL_USER_ROLES } from "@/types/assessment";

const ORG = "org-1";
const WORKSPACE = { developerWorkspace: true };
const CUSTOMER = { developerWorkspace: false };

describe("managing an organization's members", () => {
  it("a platform admin manages any organization", () => {
    expect(mayManageOrgMembers({ role: "platform_admin", organizationId: null }, ORG, CUSTOMER)).toBe(true);
  });

  it.each(["partner_lead", "client_admin"])("%s manages its own organization only", (role) => {
    for (const org of [WORKSPACE, CUSTOMER]) {
      expect(mayManageOrgMembers({ role, organizationId: ORG }, ORG, org)).toBe(true);
      expect(mayManageOrgMembers({ role, organizationId: "org-2" }, ORG, org)).toBe(false);
      expect(mayManageOrgMembers({ role, organizationId: null }, ORG, org)).toBe(false);
    }
  });

  it("a sandbox developer manages its own developer workspace only (review round 2)", () => {
    const developer = { role: "sandbox_developer", organizationId: ORG };
    expect(mayManageOrgMembers(developer, ORG, WORKSPACE)).toBe(true);
    expect(mayManageOrgMembers(developer, ORG, CUSTOMER)).toBe(false);
    expect(mayManageOrgMembers(developer, "org-2", WORKSPACE)).toBe(false);
  });

  it.each(["consultant", "viewer", "support", "project_manager"])("%s does not manage members", (role) => {
    expect(mayManageOrgMembers({ role, organizationId: ORG }, ORG, WORKSPACE)).toBe(false);
  });

  it("a consultant reads its own member list, a sandbox developer its own workspace's", () => {
    expect(mayViewOrgMembers({ role: "consultant", organizationId: ORG }, ORG, CUSTOMER)).toBe(true);
    expect(mayViewOrgMembers({ role: "sandbox_developer", organizationId: ORG }, ORG, WORKSPACE)).toBe(true);
    expect(mayViewOrgMembers({ role: "sandbox_developer", organizationId: ORG }, ORG, CUSTOMER)).toBe(false);
    expect(mayViewOrgMembers({ role: "sandbox_developer", organizationId: "org-2" }, ORG, WORKSPACE)).toBe(false);
    expect(mayViewOrgMembers({ role: "viewer", organizationId: ORG }, ORG, WORKSPACE)).toBe(false);
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
    expect(refuseAcceptForExistingAccount("platform_admin", "sandbox_developer", true)).toMatch(/platform administrator/);
    expect(refuseAcceptForExistingAccount("platform_admin", "partner_lead", true)).toMatch(/platform administrator/);
    expect(refuseAcceptForExistingAccount("admin", "viewer", true)).not.toBeNull();
    expect(refuseAcceptForExistingAccount("platform_admin", "platform_admin", true)).toBeNull();
  });

  it("a developer workspace's invitation never replaces another role", () => {
    expect(refuseAcceptForExistingAccount("consultant", "sandbox_developer", true)).not.toBeNull();
    expect(refuseAcceptForExistingAccount("sandbox_developer", "sandbox_developer", true)).toBeNull();
  });

  it("a developer workspace's invitation never reactivates a deactivated account (review round 2)", () => {
    expect(refuseAcceptForExistingAccount("sandbox_developer", "sandbox_developer", false)).toMatch(/deactivated/);
  });

  it("every other invitation works as before", () => {
    expect(refuseAcceptForExistingAccount("consultant", "project_manager", true)).toBeNull();
    expect(refuseAcceptForExistingAccount("viewer", "partner_lead", true)).toBeNull();
    // An administrator's invitation still brings a deactivated account back.
    expect(refuseAcceptForExistingAccount("consultant", "consultant", false)).toBeNull();
  });
});

describe("which invitations are mailed (review round 2)", () => {
  it("a sandbox developer's invitation is mailed only to an address with no account", () => {
    expect(mailsInvitation("sandbox_developer", false)).toBe(true);
    expect(mailsInvitation("sandbox_developer", true)).toBe(false);
  });

  it.each(["partner_lead", "client_admin", "platform_admin"])("%s's invitation is always mailed", (role) => {
    expect(mailsInvitation(role, true)).toBe(true);
    expect(mailsInvitation(role, false)).toBe(true);
  });
});

describe("what a sandbox developer's invite rights reach (review round 1)", () => {
  it("is held to a daily send budget that nobody else is", () => {
    expect(inviteSendBudget("sandbox_developer")).toBe(DEVELOPER_WORKSPACE_INVITES_PER_DAY);
    for (const role of ["partner_lead", "client_admin", "platform_admin"]) {
      expect(inviteSendBudget(role), role).toBeNull();
    }
  });

  it("manages sandbox developer invitations only", () => {
    const developer = { role: "sandbox_developer", organizationId: ORG };
    expect(managedInvitationRole(developer)).toBe("sandbox_developer");
    expect(mayManageInvitation(developer, { role: "sandbox_developer" })).toBe(true);
    expect(mayManageInvitation(developer, { role: "client_admin" })).toBe(false);
    expect(mayManageInvitation(developer, { role: "viewer" })).toBe(false);
  });

  it.each(["partner_lead", "client_admin", "platform_admin"])("leaves %s managing every invitation", (role) => {
    const member = { role, organizationId: ORG };
    expect(managedInvitationRole(member)).toBeNull();
    expect(mayManageInvitation(member, { role: "client_admin" })).toBe(true);
  });
});
