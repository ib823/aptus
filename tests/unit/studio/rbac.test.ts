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
  canAccessControlTower,
  canAccessOperations,
  canMutateControlTower,
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

/* ── the three-workspace matrix ──────────────────────────────────────────────
 *
 * The Console is one app with three RBAC-gated workspaces. These pin who opens
 * which, because the failure mode is silent: a helper that quietly widens gives
 * a persona a workspace nobody decided it should have, and every screen inside
 * then looks like it was meant for them.
 */
describe("the support persona", () => {
  it("opens the Operations Center and NOTHING else", () => {
    expect(canAccessOperations("support")).toBe(true);
    expect(canAccessStudio("support")).toBe(false);
    expect(canAccessControlTower("support")).toBe(false);
    expect(accessibleWorkspaces("support")).toEqual(["operations-center"]);
  });

  it("cannot mutate anywhere — it watches the running system, it does not change it", () => {
    expect(canMutateStudio("support")).toBe(false);
    expect(canMutateControlTower("support")).toBe(false);
  });
});

describe("Control Tower entitlement", () => {
  it("admits platform_admin as owner", () => {
    expect(canAccessControlTower("platform_admin")).toBe(true);
    expect(canMutateControlTower("platform_admin")).toBe(true);
  });

  it("admits the read-only viewers, and lets none of them mutate", () => {
    for (const role of ["partner_lead", "executive_sponsor", "project_manager"]) {
      expect(canAccessControlTower(role), `${role} must read Control Tower`).toBe(true);
      expect(canMutateControlTower(role), `${role} must not mutate`).toBe(false);
    }
  });

  it("locks everyone else out", () => {
    for (const role of ["consultant", "support", "solution_architect", "process_owner", "it_lead", "viewer", "client_admin"]) {
      expect(canAccessControlTower(role), `${role} must not reach Control Tower`).toBe(false);
    }
  });

  it("does NOT widen canMutateStudio — the admin decision path is a new capability", () => {
    // Control Tower's grant decision is admin-only and lives on its own helper.
    // Studio's mutations stay the builder's; conflating them would hand an admin
    // every Studio mutation as a side effect of gaining Control Tower.
    expect(canMutateControlTower("platform_admin")).toBe(true);
    expect(canMutateStudio("platform_admin")).toBe(false);
  });
});

describe("no role can widen its own access", () => {
  it("rejects unknown, empty and tampered role strings everywhere", () => {
    // "SUPPORT" and "platform_admin " (trailing space) matter most: role checks
    // are exact-match, and a near-miss must fail closed rather than normalise
    // itself into an entitlement. Unknown strings resolve to `viewer`.
    for (const role of ["", "superuser", "SUPPORT", "platform_admin ", "support ", null, undefined]) {
      expect(canAccessOperations(role as string), `${String(role)}`).toBe(false);
      expect(canAccessControlTower(role as string), `${String(role)}`).toBe(false);
      expect(canMutateControlTower(role as string), `${String(role)}`).toBe(false);
      expect(accessibleWorkspaces(role as string), `${String(role)}`).toEqual([]);
    }
  });

  it("still honours the documented legacy alias, and only that one", () => {
    // `admin` is a real legacy value mapped to platform_admin in LEGACY_ROLE_MAP,
    // not a tampered string — so it legitimately carries admin entitlement. This
    // is pinned rather than left implicit, because "why does 'admin' work?" is
    // otherwise answered by reading three files.
    expect(canAccessOperations("admin")).toBe(true);
    expect(canAccessControlTower("admin")).toBe(true);
    expect(canMutateControlTower("admin")).toBe(true);
  });
});
