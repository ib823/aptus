/**
 * /coreedge/members asks the same question the member-list API asks
 * (roadmap P0.13, review round 1).
 *
 * The (coreedge) layout renders for every signed-in user, and the page listed
 * every member's name, email and role to whoever opened it — a viewer, an
 * executive sponsor, support — while GET /api/organizations/[orgId]/users
 * refused the same person (`mayViewOrgMembers`). A screen must not be a
 * wider door than the route beside it.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "u1", role: "viewer", organizationId: "org1", email: "me@org1.test" } as Record<string, unknown>,
  findMembers: vi.fn(),
  findInvitations: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findMany: mocks.findMembers },
    orgInvitation: { findMany: mocks.findInvitations },
  },
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/(coreedge)/coreedge/CoreEdgeShell", () => ({
  CoreEdgeShell: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/coreedge/actions/InviteMember", () => ({
  InviteMember: (props: Record<string, unknown>) => `[invite ${JSON.stringify(props)}]`,
}));

const MEMBERS = [
  { id: "m1", name: "Ada Admin", email: "ada@org1.test", role: "client_admin", isActive: true },
  { id: "m2", name: "Bo Builder", email: "bo@org1.test", role: "consultant", isActive: true },
];

async function render(): Promise<string> {
  const { default: MembersPage } = await import("@/app/(coreedge)/coreedge/members/page");
  return renderToStaticMarkup((await MembersPage()) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMembers.mockResolvedValue(MEMBERS);
  mocks.findInvitations.mockResolvedValue([]);
});

describe("the members screen", () => {
  it.each(["viewer", "executive_sponsor", "support", "project_manager"])(
    "shows %s no member directory, and does not read it",
    async (role) => {
      mocks.user = { id: "u1", role, organizationId: "org1", email: "me@org1.test" };

      const html = await render();

      expect(html).not.toContain("ada@org1.test");
      expect(html).not.toContain("bo@org1.test");
      expect(mocks.findMembers).not.toHaveBeenCalled();
      expect(html).toMatch(/member list is limited/i);
    },
  );

  it.each(["client_admin", "consultant", "sandbox_developer"])("shows %s the members of its own organization", async (role) => {
    mocks.user = { id: "u1", role, organizationId: "org1", email: "me@org1.test" };

    const html = await render();

    expect(html).toContain("ada@org1.test");
    expect(mocks.findMembers).toHaveBeenCalledTimes(1);
  });
});
