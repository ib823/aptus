import { describe, it, expect, vi, beforeEach } from "vitest";

let engagementRow: { createdById: string | null } | null = null;
let adminRoles: Set<string> = new Set(["platform_admin"]);

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    discoveryEngagement: {
      findUnique: async () => engagementRow,
    },
  },
}));

vi.mock("@/lib/auth/permissions", () => ({
  isAdminRole: (role: string) => adminRoles.has(role),
}));

import { requireDiscoveryEngagementAccess } from "@/lib/discovery/authz";
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

describe("requireDiscoveryEngagementAccess", () => {
  beforeEach(() => {
    engagementRow = null;
    adminRoles = new Set(["platform_admin"]);
  });

  it("allows the consultant who created the engagement", async () => {
    engagementRow = { createdById: "u_owner" };
    const res = await requireDiscoveryEngagementAccess("e1", user());
    expect(res.ok).toBe(true);
  });

  it("denies another consultant with a 404 (the IDOR that was fixed)", async () => {
    engagementRow = { createdById: "someone_else" };
    const res = await requireDiscoveryEngagementAccess("e1", user({ id: "u_attacker" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(404);
  });

  it("allows platform_admin regardless of owner", async () => {
    engagementRow = { createdById: "someone_else" };
    const res = await requireDiscoveryEngagementAccess(
      "e1",
      user({ id: "u_admin", role: "platform_admin" }),
    );
    expect(res.ok).toBe(true);
  });

  it("denies a non-admin when the engagement has a null owner", async () => {
    engagementRow = { createdById: null };
    const res = await requireDiscoveryEngagementAccess("e1", user());
    expect(res.ok).toBe(false);
  });
});
