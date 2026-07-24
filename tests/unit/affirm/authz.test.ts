import { describe, it, expect, vi, beforeEach } from "vitest";

// Mutable fixture the mocked prisma reads from.
let bundleRow: { createdById: string | null } | null = null;
let adminRoles: Set<string> = new Set(["platform_admin"]);

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    affirmBundle: {
      findUnique: async () => bundleRow,
    },
  },
}));

vi.mock("@/lib/auth/permissions", () => ({
  isAdminRole: (role: string) => adminRoles.has(role),
}));

import { requireAffirmBundleAccess } from "@/lib/affirm/authz";
import type { SessionUser } from "@/types/assessment";

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "u_owner",
    email: "owner@example.com",
    name: "Owner",
    role: "consultant",
    organizationId: "org_1",
    organizationMfaPolicy: null,
    mfaEnabled: false,
    mfaVerified: false,
    hasWebAuthn: false,
    ...overrides,
  } as SessionUser;
}

describe("requireAffirmBundleAccess", () => {
  beforeEach(() => {
    bundleRow = null;
    adminRoles = new Set(["platform_admin"]);
  });

  it("allows the consultant who created the bundle", async () => {
    bundleRow = { createdById: "u_owner" };
    const res = await requireAffirmBundleAccess("b1", user());
    expect(res.ok).toBe(true);
  });

  it("denies another consultant (the IDOR that was fixed) with a 404", async () => {
    bundleRow = { createdById: "someone_else" };
    const res = await requireAffirmBundleAccess("b1", user({ id: "u_attacker" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(404);
  });

  it("allows platform_admin regardless of owner", async () => {
    bundleRow = { createdById: "someone_else" };
    const res = await requireAffirmBundleAccess(
      "b1",
      user({ id: "u_admin", role: "platform_admin" }),
    );
    expect(res.ok).toBe(true);
  });

  it("denies a non-admin when the bundle has a null owner", async () => {
    bundleRow = { createdById: null };
    const res = await requireAffirmBundleAccess("b1", user());
    expect(res.ok).toBe(false);
  });

  it("returns 404 when the bundle does not exist", async () => {
    bundleRow = null;
    const res = await requireAffirmBundleAccess("missing", user());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(404);
  });
});
