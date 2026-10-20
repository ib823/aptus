/**
 * GET /api/sap/ariba/call refuses a sandbox developer before any call leaves
 * (roadmap P0.13, review round 1).
 *
 * The route's only gate is the probe guard, and the guard admitted the
 * sandbox developer because `canAccessStudio` does. Unlike the OData read
 * routes, this one never capped the role at SANDBOX, so a stranger from an
 * open sign-up ran an OAuth exchange and a live REST read against the
 * deployment's real Ariba realm — any realm they named. An Ariba realm
 * declares no landscape, so there is no SANDBOX to cap at: the role is
 * refused outright, by the real guard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  callAribaEndpoint: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/sap-public/ariba-connector", () => ({
  isAribaConfigured: () => true,
  callAribaEndpoint: mocks.callAribaEndpoint,
}));
vi.mock("@/lib/audit/decision-logger", () => ({ logDecision: vi.fn() }));

import { GET } from "@/app/api/sap/ariba/call/route";

const get = () =>
  ({ nextUrl: new URL("http://localhost/api/sap/ariba/call?endpoint=/sourcing-projects&realm=customer-prod") }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.callAribaEndpoint.mockResolvedValue({ status: 200, data: [] });
});

describe("GET /api/sap/ariba/call", () => {
  it("refuses a sandbox developer with 403 and never calls Ariba", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "d1", role: "sandbox_developer", organizationId: "ws1", email: "d@x.test" });

    const res = await GET(get());

    expect(res.status).toBe(403);
    expect(mocks.callAribaEndpoint).not.toHaveBeenCalled();
  });

  it("still serves a builder", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "consultant", organizationId: "org1", email: "c@x.test" });

    const res = await GET(get());

    expect(res.status).toBe(200);
    expect(mocks.callAribaEndpoint).toHaveBeenCalledTimes(1);
  });
});
