/**
 * The review screen, rendered: what it tells a reviewer before the click.
 *
 * TWO DEFECTS PINNED HERE, both of the same shape — the screen offering a
 * decision the rules forbid, or describing a request as something it is not:
 *
 *  - An app's owner was shown an enabled Approve on their own app's request
 *    (`ownApp` existed and nothing returned it).
 *  - Every request's write-checklist row read "this request is for reads",
 *    CREATE and UPDATE included, and the bar was never told it was a write.
 *
 * The page is a plain async server component, so it is awaited and rendered to
 * markup with its data and chrome mocked. The bar is stubbed to print the props
 * it was handed — what it does with them is review-decision.test.tsx.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DISABLED_REASONS } from "@/lib/coreedge/copy";

const getRequest = vi.fn();
const listSapSystems = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u_owner", role: "consultant", organizationId: "org1" }),
}));
vi.mock("@/lib/coreedge/queries", () => ({
  getRequest: (...a: unknown[]) => getRequest(...a),
  listSapSystems: (...a: unknown[]) => listSapSystems(...a),
}));
vi.mock("@/app/(coreedge)/coreedge/CoreEdgeShell", () => ({
  CoreEdgeShell: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/coreedge/actions/ReviewDecision", () => ({
  ReviewDecision: (props: Record<string, unknown>) => `[bar ${JSON.stringify(props)}]`,
}));

function request(over: Record<string, unknown> = {}) {
  return {
    id: "g1",
    appId: "a1",
    appName: "Supplier onboarding",
    appSlug: "supplier-onboarding",
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

async function renderReview(over: Record<string, unknown> = {}): Promise<string> {
  getRequest.mockResolvedValue(request(over));
  listSapSystems.mockResolvedValue([
    { id: "s1", name: "S4H-TST", environment: "TEST", environmentRaw: "TEST" },
  ]);
  const { default: RequestReview } = await import("@/app/(coreedge)/coreedge/requests/[id]/page");
  const tree = await RequestReview({ params: Promise.resolve({ id: "g1" }) });
  // Entities decoded so the bar's JSON props read as written.
  return renderToStaticMarkup(tree as never).replaceAll("&quot;", '"');
}

beforeEach(() => {
  getRequest.mockReset();
  listSapSystems.mockReset();
});

describe("an app's owner is refused before the click", () => {
  it("blocks the bar with the ownApp reason when the viewer owns the app", async () => {
    const html = await renderReview({ ownerIds: [null, "u_owner", null] });
    expect(html).toContain(`"blockedBecause":"${DISABLED_REASONS.ownApp}"`);
  });

  it("leaves the bar open for a colleague who owns nothing", async () => {
    const html = await renderReview();
    expect(html).toContain('"blockedBecause":null');
  });
});

describe("the write checklist row follows the request's operation", () => {
  it("tells the bar a CREATE request is a write, and does not call it a read", async () => {
    const html = await renderReview({ operation: "CREATE", feedLabel: "API_BUSINESS_PARTNER · CREATE" });
    expect(html).toContain('"isWrite":true');
    expect(html).not.toContain("this request is for reads");
    expect(html).toContain("Confirm the write checklist below before approving");
  });

  it("still marks the row not applicable on a read", async () => {
    const html = await renderReview();
    expect(html).toContain('"isWrite":false');
    expect(html).toContain("Not applicable — this request is for reads.");
  });
});
