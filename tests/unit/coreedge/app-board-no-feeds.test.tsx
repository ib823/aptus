/**
 * An app with no data feeds has a board, not a 404 (P0.3, A63).
 *
 * THE DEFECT. The lane board asked `listLanes` for the app's lanes and called
 * notFound() when none came back. Lanes are feeds × environments, so an app
 * that exists but has no feed yet has none — and its owner, opening the app
 * they had just created, was told it does not exist, on the only screen that
 * links to "Add data feed". Whether the app EXISTS is now asked separately
 * from whether it has lanes; only a missing app is a 404.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_STATES } from "@/lib/coreedge/copy";

const mocks = vi.hoisted(() => ({
  user: { id: "u1", role: "consultant", organizationId: "org1", email: "me@org1.test" } as Record<string, unknown> | null,
  listLanes: vi.fn(),
  getApp: vi.fn(),
}));

class NotFound extends Error {}

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: () => {
    throw new NotFound("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/coreedge/queries", () => ({ listLanes: mocks.listLanes, getApp: mocks.getApp }));
vi.mock("@/app/(coreedge)/coreedge/CoreEdgeShell", () => ({
  CoreEdgeShell: ({ title, subtitle, children }: { title: string; subtitle?: string; children: unknown }) => (
    <main>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children as never}
    </main>
  ),
}));

async function render(app: string): Promise<string> {
  const { default: AppLaneBoard } = await import("@/app/(coreedge)/coreedge/apps/[app]/page");
  return renderToStaticMarkup((await AppLaneBoard({ params: Promise.resolve({ app }) })) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listLanes.mockResolvedValue([]);
});

describe("the lane board of an app with no feeds (A63)", () => {
  it("renders the app, the empty state and the way to add a feed, not a 404", async () => {
    mocks.getApp.mockResolvedValue({ id: "sol1", slug: "po-sync", name: "PO sync", status: "draft", feedCount: 0 });

    const html = await render("po-sync");

    expect(html).toContain("PO sync");
    expect(html).toContain(EMPTY_STATES.appNoFeeds.message);
    expect(html).toContain('href="/coreedge/apps/po-sync/add-feed"');
    expect(html).toContain('href="/coreedge/apps/po-sync/settings"');
    // Asked in the caller's own organization.
    expect(mocks.getApp).toHaveBeenCalledWith("org1", "po-sync");
  });

  it("is still a 404 for an app that does not exist here", async () => {
    mocks.getApp.mockResolvedValue(null);
    await expect(render("nope")).rejects.toBeInstanceOf(NotFound);
  });
});
