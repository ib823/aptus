/**
 * Who may run a fleet probe — and the deadlock that made the product unusable.
 *
 * THE DEADLOCK. Authoring a solution or an interface requires `consultant`:
 * `canMutateStudio` is builder-only and `platform_admin` is deliberately false,
 * because "an admin's Studio access is oversight, not authorship". Probing the
 * tenant required `platform_admin`. So NO SINGLE ROLE could set an organization
 * up end to end — the only role that can create anything could never establish
 * what its tenant exposes.
 *
 * THE RESOLUTION IS NOT "WIDEN IT". A deployment tenant is shared by every
 * organization on the deployment and its probes are filed under a bare key
 * everyone reads; handing that write to any builder would let one client's
 * consultant rewrite every other client's view. A connection-backed tenant is
 * the caller's own by construction — `resolveReadTenant` looks it up with
 * `resolveSapConnection(organizationId, …)` — and probing your own client's
 * system is exactly the builder's job.
 */

import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as AdminGuard from "@/lib/auth/admin-guard";

type AdminGuardModule = typeof AdminGuard;

const mocks = vi.hoisted(() => ({
  requireAuthenticated: vi.fn(),
  resolveReadTenant: vi.fn(),
  checkRateLimit: vi.fn(),
  probeService: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  logDecision: vi.fn(),
}));

// Partial mock: `isAdminError` must stay real, because the route narrows on it.
vi.mock("@/lib/auth/admin-guard", async (importOriginal) => {
  const actual = await importOriginal<AdminGuardModule>();
  return { ...actual, requireAuthenticated: mocks.requireAuthenticated };
});
vi.mock("@/lib/sap-public/tenant-for-read", () => ({ resolveReadTenant: mocks.resolveReadTenant }));
vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/sap-public/capability-probe", () => ({ probeService: mocks.probeService }));
vi.mock("@/lib/audit/decision-logger", () => ({ logDecision: mocks.logDecision }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { sapHubContent: { findMany: mocks.findMany, update: mocks.update } },
}));

import { POST } from "@/app/api/sap/tdd/hub-content/probe-all/route";

const CONFIRMATION = "PROBE ALL SAP SERVICES";

const CONSULTANT = { id: "u1", role: "consultant", organizationId: "org-a", email: "c@x.com" };
const ADMIN = { id: "u2", role: "platform_admin", organizationId: "org-a", email: "a@x.com" };
const VIEWER = { id: "u3", role: "viewer", organizationId: "org-a", email: "v@x.com" };

/** A tenant backed by the caller's own SapConnection row. */
const OWN_CONNECTION = {
  tenant: { key: "x5m-100", label: "Customizing X5M/100", baseUrl: "https://x" },
  source: "connection" as const,
  connection: { id: "c1", environment: "DEV" },
};
/** A tenant from {PREFIX}_* env config, shared by the whole deployment. */
const DEPLOYMENT = {
  tenant: { key: "shared", label: "Shared", baseUrl: "https://y" },
  source: "deployment" as const,
  connection: null,
};

function req(body: unknown): Request {
  return new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
}
const BODY = { confirmation: CONFIRMATION, product: "s4hana", tenant: "x5m-100" };

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 0, resetMs: 0 });
  // No probeable rows: the gate is what is under test, not the probing.
  mocks.findMany.mockResolvedValue([]);
  mocks.logDecision.mockResolvedValue(undefined);
});

describe("a builder may probe their own organization's tenant", () => {
  it("admits a consultant — the deadlock's fix", async () => {
    mocks.requireAuthenticated.mockResolvedValue({ user: CONSULTANT });
    mocks.resolveReadTenant.mockResolvedValue(OWN_CONNECTION);

    const res = await POST(req(BODY) as never);

    expect(res.status).toBe(200);
  });

  it("still admits a platform admin", async () => {
    mocks.requireAuthenticated.mockResolvedValue({ user: ADMIN });
    mocks.resolveReadTenant.mockResolvedValue(OWN_CONNECTION);

    expect((await POST(req(BODY) as never)).status).toBe(200);
  });

  it("refuses a role that authors nothing", async () => {
    mocks.requireAuthenticated.mockResolvedValue({ user: VIEWER });
    mocks.resolveReadTenant.mockResolvedValue(OWN_CONNECTION);

    const res = await POST(req(BODY) as never);

    expect(res.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});

describe("a deployment tenant stays admin-only", () => {
  it("refuses a consultant, and says why it is different", async () => {
    /*
     * The one case widening would have broken: these probes are filed under a
     * bare key every organization reads, so a builder writing there rewrites
     * every other client's view of the same shared system.
     */
    mocks.requireAuthenticated.mockResolvedValue({ user: CONSULTANT });
    mocks.resolveReadTenant.mockResolvedValue(DEPLOYMENT);

    const res = await POST(req({ ...BODY, tenant: "shared" }) as never);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(String(body.error.message)).toMatch(/deployment-wide/i);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("admits a platform admin to it", async () => {
    mocks.requireAuthenticated.mockResolvedValue({ user: ADMIN });
    mocks.resolveReadTenant.mockResolvedValue(DEPLOYMENT);

    expect((await POST(req({ ...BODY, tenant: "shared" }) as never)).status).toBe(200);
  });
});

describe("the refused conditions", () => {
  it("still demands the confirmation phrase", async () => {
    mocks.requireAuthenticated.mockResolvedValue({ user: CONSULTANT });
    mocks.resolveReadTenant.mockResolvedValue(OWN_CONNECTION);

    const res = await POST(req({ ...BODY, confirmation: "yes please" }) as never);

    expect(res.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("refuses a tenant neither registry knows", async () => {
    mocks.requireAuthenticated.mockResolvedValue({ user: CONSULTANT });
    mocks.resolveReadTenant.mockResolvedValue(null);

    expect((await POST(req(BODY) as never)).status).toBe(400);
  });

  it("passes an unauthenticated caller's refusal straight through", async () => {
    /*
     * A real NextResponse, not a bare Response: `isAdminError` narrows with
     * `instanceof NextResponse`, so a plain Response sails past the guard and
     * the route runs with no user. Worth knowing — the guard's contract is the
     * concrete class, not the shape.
     */
    mocks.requireAuthenticated.mockResolvedValue(
      NextResponse.json({ error: { message: "Not authenticated" } }, { status: 401 }),
    );

    expect((await POST(req(BODY) as never)).status).toBe(401);
    expect(mocks.resolveReadTenant).not.toHaveBeenCalled();
  });
});

describe("the fleet probe is rate limited, per tenant", () => {
  it("refuses a second run inside the window", async () => {
    /*
     * Six hundred-odd requests at eight-way concurrency into a CLIENT's SAP
     * system. When only an admin could fire it the confirmation phrase was the
     * whole restraint; a builder can now fire it too.
     */
    mocks.requireAuthenticated.mockResolvedValue({ user: CONSULTANT });
    mocks.resolveReadTenant.mockResolvedValue(OWN_CONNECTION);
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetMs: 120_000 });

    const res = await POST(req(BODY) as never);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("keys the limit by the tenant's OWNER, not by the bare name", async () => {
    // Two organizations on the same tenant name must not starve each other.
    mocks.requireAuthenticated.mockResolvedValue({ user: CONSULTANT });
    mocks.resolveReadTenant.mockResolvedValue(OWN_CONNECTION);

    await POST(req(BODY) as never);

    const key = String(mocks.checkRateLimit.mock.calls[0]?.[0]);
    expect(key).toContain("org-a");
    expect(key).toContain("x5m-100");
  });
});
