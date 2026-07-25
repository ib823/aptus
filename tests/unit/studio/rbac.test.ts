/**
 * Developer Studio RBAC — the gate that decides who sees the workspace at all.
 *
 * The design names its personas "Developer" / "Support" / "Platform Admin", but
 * this codebase has no `developer` or `support` role. These tests pin the agreed
 * mapping (Developer → consultant, Platform Admin → platform_admin) so a future
 * change to the role model fails loudly here rather than silently widening or
 * closing access.
 */

import { describe, expect, it } from "vitest";

import {
  WORKSPACES,
  accessibleWorkspaces,
  canAccessStudio,
  canMutateStudio,
  isStudioBuilder,
  lacksStudioTenantScope,
} from "@/lib/studio/rbac";

describe("canAccessStudio", () => {
  it("admits the builder persona (consultant = the design's Developer)", () => {
    expect(canAccessStudio("consultant")).toBe(true);
  });

  it("admits platform_admin for oversight", () => {
    expect(canAccessStudio("platform_admin")).toBe(true);
  });

  it("rejects every other role", () => {
    for (const role of [
      "partner_lead",
      "project_manager",
      "solution_architect",
      "process_owner",
      "it_lead",
      "data_migration_lead",
      "executive_sponsor",
      "viewer",
      "client_admin",
    ]) {
      expect(canAccessStudio(role), `${role} must not reach Studio`).toBe(false);
    }
  });

  it("rejects a missing role", () => {
    expect(canAccessStudio(null)).toBe(false);
    expect(canAccessStudio(undefined)).toBe(false);
    expect(canAccessStudio("")).toBe(false);
  });
});

describe("canMutateStudio", () => {
  it("allows the builder to make governance changes", () => {
    expect(canMutateStudio("consultant")).toBe(true);
  });

  it("does NOT let an admin mutate — admin Studio access is oversight", () => {
    // The admin can open Studio (canAccessStudio) but governance changes are the
    // builder's action; admin governance lives in Control Tower (v2).
    expect(canAccessStudio("platform_admin")).toBe(true);
    expect(canMutateStudio("platform_admin")).toBe(false);
  });

  it("rejects everyone else", () => {
    expect(canMutateStudio("viewer")).toBe(false);
    expect(canMutateStudio(null)).toBe(false);
  });
});

describe("isStudioBuilder", () => {
  it("is exactly the consultant role", () => {
    expect(isStudioBuilder("consultant")).toBe(true);
    expect(isStudioBuilder("platform_admin")).toBe(false);
    expect(isStudioBuilder("partner_lead")).toBe(false);
  });
});

describe("accessibleWorkspaces", () => {
  it("gives a builder only Developer Studio", () => {
    expect(accessibleWorkspaces("consultant")).toEqual(["developer-studio"]);
  });

  it("gives platform_admin all three workspaces", () => {
    expect(accessibleWorkspaces("platform_admin")).toEqual(WORKSPACES.map((w) => w.key));
  });

  it("gives an unentitled role nothing", () => {
    expect(accessibleWorkspaces("viewer")).toEqual([]);
    expect(accessibleWorkspaces(null)).toEqual([]);
  });
});

describe("WORKSPACES", () => {
  it("declares all three console workspaces, with only Developer Studio built in v1", () => {
    expect(WORKSPACES.map((w) => w.key)).toEqual([
      "developer-studio",
      "operations-center",
      "control-tower",
    ]);
    const built = WORKSPACES.filter((w) => w.availableInV1);
    expect(built).toHaveLength(1);
    expect(built[0]?.href).toBe("/studio");
    // An unbuilt workspace must not carry a route — the rail renders it locked.
    for (const w of WORKSPACES.filter((x) => !x.availableInV1)) {
      expect(w.href).toBeNull();
    }
  });
});

describe("lacksStudioTenantScope", () => {
  it("rejects a non-admin with no organization (nothing to scope queries to)", () => {
    expect(lacksStudioTenantScope({ organizationId: null, role: "consultant" })).toBe(true);
  });

  it("accepts a non-admin that has an organization", () => {
    expect(lacksStudioTenantScope({ organizationId: "org_1", role: "consultant" })).toBe(false);
  });

  it("exempts platform_admin, which may legitimately carry a null organization", () => {
    expect(lacksStudioTenantScope({ organizationId: null, role: "platform_admin" })).toBe(false);
  });
});
