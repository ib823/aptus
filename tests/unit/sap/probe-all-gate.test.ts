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

import { readFileSync } from "node:fs";
import path from "node:path";

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
// northboundAuditEvent: every run now records one console-read row (audit A24).
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapHubContent: { findMany: mocks.findMany, update: mocks.update },
    northboundAuditEvent: { create: vi.fn() },
    // persistStoredProbe's merge, for the one test below that probes a row.
    $executeRaw: vi.fn(),
  },
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

  it("an open console circuit refuses BEFORE the window is spent (P0.14b review)", async () => {
    /*
     * Enforcing, a run the circuit refuses never reaches the tenant. It must
     * not cost the tenant its ten-minute window either: the person retrying
     * after Retry-After would be told "a fleet probe ran moments ago" when
     * none did.
     */
    const { __setGovernedCircuitStore, circuitKeyForConnection, circuitKeyForConsoleRead, governedCircuitBreaker } =
      await import("@/lib/governed/containment");
    const { FAILURE_THRESHOLD, MemoryCircuitStore } = await import("@/lib/northbound/circuit-breaker");
    vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "enforce");
    __setGovernedCircuitStore(new MemoryCircuitStore({ shared: true }));
    try {
      const consoleCircuit = circuitKeyForConsoleRead("org-a", circuitKeyForConnection("c1"));
      for (let i = 0; i < FAILURE_THRESHOLD; i++) await governedCircuitBreaker().recordOutcome(consoleCircuit, "upstream-error");
      mocks.requireAuthenticated.mockResolvedValue({ user: CONSULTANT });
      mocks.resolveReadTenant.mockResolvedValue(OWN_CONNECTION);
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const res = await POST(req(BODY) as never);

      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("CIRCUIT_OPEN");
      expect(mocks.checkRateLimit).not.toHaveBeenCalled();
      expect(mocks.findMany).not.toHaveBeenCalled();
      expect(mocks.probeService).not.toHaveBeenCalled();
    } finally {
      __setGovernedCircuitStore(null);
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
  });
});

describe("a Probe all that never calls SAP gives the circuit's half-open trial back (P0.14b review round 3)", () => {
  /*
   * contain() runs before the rate limit, so an open circuit refuses without
   * spending the tenant's window. Past the cooldown, contain() takes the
   * circuit's ONE half-open trial. A run the limiter then refuses (429), a
   * limiter outage (503) or a catalogue query that throws never reached SAP:
   * holding the trial for PROBE_LEASE_MS refused every other console read of
   * that system by the organization (enforce), or inflated the "would refuse"
   * lines the runbook decides on (observe), although nothing tested it.
   */
  async function halfOpenConsoleCircuit() {
    const { __setGovernedCircuitStore, circuitKeyForConnection, circuitKeyForConsoleRead, governedCircuitBreaker } =
      await import("@/lib/governed/containment");
    const { COOLDOWN_MS, FAILURE_THRESHOLD, MemoryCircuitStore } = await import("@/lib/northbound/circuit-breaker");
    vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "enforce");
    __setGovernedCircuitStore(new MemoryCircuitStore({ shared: true }));
    const t0 = Date.parse("2026-10-21T09:00:00Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(t0);
    const key = circuitKeyForConsoleRead("org-a", circuitKeyForConnection("c1"));
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await governedCircuitBreaker().recordOutcome(key, "upstream-error");
    // The cooldown is served: the next console call may take the trial.
    vi.setSystemTime(t0 + COOLDOWN_MS + 1_000);
    mocks.requireAuthenticated.mockResolvedValue({ user: CONSULTANT });
    mocks.resolveReadTenant.mockResolvedValue(OWN_CONNECTION);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    return {
      /** Whether another console read of the same system, a second later, is let through. */
      nextReadAllowed: async () => {
        vi.setSystemTime(t0 + COOLDOWN_MS + 2_000);
        return (await governedCircuitBreaker().beforeCall(key)).allowed;
      },
      restore: () => {
        __setGovernedCircuitStore(null);
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      },
    };
  }

  it("a rate-limited run (429)", async () => {
    const circuit = await halfOpenConsoleCircuit();
    try {
      mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetMs: 120_000 });

      const res = await POST(req(BODY) as never);

      expect(res.status).toBe(429);
      expect(mocks.probeService).not.toHaveBeenCalled();
      expect(await circuit.nextReadAllowed()).toBe(true);
    } finally {
      circuit.restore();
    }
  });

  it("a limiter outage (503)", async () => {
    const circuit = await halfOpenConsoleCircuit();
    try {
      mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetMs: 0, reason: "unavailable" });

      const res = await POST(req(BODY) as never);

      expect(res.status).toBe(503);
      expect(mocks.probeService).not.toHaveBeenCalled();
      expect(await circuit.nextReadAllowed()).toBe(true);
    } finally {
      circuit.restore();
    }
  });

  it("a catalogue query that throws", async () => {
    const circuit = await halfOpenConsoleCircuit();
    try {
      mocks.findMany.mockRejectedValue(new Error("database unavailable"));

      await expect(POST(req(BODY) as never)).rejects.toThrow(/database unavailable/);
      expect(mocks.probeService).not.toHaveBeenCalled();
      expect(await circuit.nextReadAllowed()).toBe(true);
    } finally {
      circuit.restore();
    }
  });

  it("a run that did call SAP still settles the trial by what SAP answered", async () => {
    // The release is for runs that sent nothing; one that probed a failing
    // system re-opens the circuit, as before.
    const circuit = await halfOpenConsoleCircuit();
    try {
      mocks.findMany.mockResolvedValue([
        { id: "r1", externalId: "API_X", contentType: "API", apiType: "ODATAV2", title: "X", packageId: null, communicationScenarios: [] },
      ]);
      mocks.probeService.mockResolvedValue({ status: 503, entities: [] });

      await POST(req(BODY) as never);

      expect(mocks.probeService).toHaveBeenCalled();
      expect(await circuit.nextReadAllowed()).toBe(false);
    } finally {
      circuit.restore();
    }
  });
});

describe("the screen does not tell a builder that probing is an admin's job", () => {
  /** The catalogue's source, comments stripped — claims in code, not in prose. */
  function catalogueCode(): string {
    const file = path.resolve(process.cwd(), "src/components/sap/SapCapabilityCatalogue.tsx");
    return readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  it("no longer says Probe-all is admin only", () => {
    /*
     * The fallback error read "Probe-all failed (admin only)" — true when it
     * was written, false the moment a builder could probe their own tenant.
     * It fires only when the server sends no message, so it must not guess at
     * a reason it cannot know: naming the wrong one sends the reader off to
     * ask for a permission they may already hold.
     */
    const probeAll = catalogueCode().split("const probeAll")[1]?.slice(0, 2000) ?? "";
    expect(probeAll).not.toMatch(/admin only/i);
  });

  it("still says so for the two controls that ARE admin only", () => {
    // Rebuild and Import rewrite the GLOBAL catalogue rows every organization
    // reads. Widening this assertion to the whole file would have deleted a
    // true claim alongside the false one.
    const code = catalogueCode();
    expect(code).toMatch(/Rebuild failed \(admin only\)/);
  });
});
