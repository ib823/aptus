/**
 * CoreEdge Home: a review the viewer cannot decide is not coloured as theirs.
 *
 * THE DEFECT. The home page compared only `requestedById`, so a request a
 * colleague raised on an app the viewer OWNS was listed with the "action"
 * accent — "Needs you" — and "Requested by …", and the review screen it
 * opened refused the decision with ownApp. `listOpenRequests` already returned
 * the owner ids for exactly this; the home page ignored them.
 *
 * The page is a plain async server component, so it is awaited and rendered
 * to markup with its data and chrome mocked; the row component is real, so the
 * accent's words ("Needs you." / "Waiting on someone else.") are what is read.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DISABLED_REASONS } from "@/lib/coreedge/copy";

const listOpenRequests = vi.fn();

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u_me", role: "consultant", organizationId: "org1" }),
}));
vi.mock("@/lib/coreedge/queries", () => ({
  listLanes: async () => [],
  listOpenRequests: (...a: unknown[]) => listOpenRequests(...a),
}));
vi.mock("@/app/(coreedge)/coreedge/CoreEdgeShell", () => ({
  CoreEdgeShell: ({ children }: { children: unknown }) => children,
}));

function request(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    appId: `app_${id}`,
    appName: `App ${id}`,
    appSlug: `app-${id}`,
    feedLabel: "API_BUSINESS_PARTNER · READ",
    operation: "READ",
    environment: "TEST",
    environmentRaw: "TEST",
    decision: "REQUESTED",
    justification: "Needed to read supplier master data.",
    requestedById: "u_colleague",
    requestedByName: "Colleague",
    ownerIds: ["u_colleague", null, null],
    createdAt: new Date("2026-10-01T00:00:00Z"),
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    ...over,
  };
}

async function renderHome(): Promise<string> {
  const { default: CoreEdgeHome } = await import("@/app/(coreedge)/coreedge/page");
  return renderToStaticMarkup((await CoreEdgeHome()) as never).replaceAll("&#x27;", "'");
}

/** The markup of the row whose title names this app. */
function rowFor(html: string, appName: string): string {
  const start = html.indexOf(`Review access · ${appName}`);
  if (start < 0) throw new Error(`no row for ${appName}`);
  // Each row opens with its accent's words, just before its title.
  const open = html.lastIndexOf('<span class="sr-only">', start);
  const next = html.indexOf('<span class="sr-only">', start);
  return html.slice(open, next < 0 ? undefined : next);
}

beforeEach(() => {
  listOpenRequests.mockReset();
});

describe("Home's review rows follow the same refusals as the review screen", () => {
  it("marks a request on the viewer's own app as blocked, with the ownApp reason", async () => {
    listOpenRequests.mockResolvedValue([request("mine", { ownerIds: [null, "u_me", null] })]);

    const row = rowFor(await renderHome(), "App mine");

    expect(row).toContain("Waiting on someone else.");
    expect(row).not.toContain("Needs you.");
    expect(row).toContain(DISABLED_REASONS.ownApp);
    expect(row).not.toContain("Requested by Colleague");
  });

  it("still marks a colleague's request on a colleague's app as actionable", async () => {
    listOpenRequests.mockResolvedValue([request("theirs")]);

    const row = rowFor(await renderHome(), "App theirs");

    expect(row).toContain("Needs you.");
    expect(row).toContain("Requested by Colleague");
  });

  it("names your own request first when you raised it on your own app", async () => {
    // The order refuseDecision checks them in: ownRequest before ownApp.
    listOpenRequests.mockResolvedValue([
      request("both", { requestedById: "u_me", ownerIds: ["u_me", null, null] }),
    ]);

    const row = rowFor(await renderHome(), "App both");

    expect(row).toContain("Waiting on someone else.");
    expect(row).toContain(DISABLED_REASONS.ownRequest);
    expect(row).not.toContain(DISABLED_REASONS.ownApp);
  });
});
