/**
 * Ops "Probe now" — three outcomes, not two.
 *
 * probeOneConnection returned null for both "no such active connection in
 * this tenant" and "the row exists but its secrets would not open", and the
 * route rendered both as NOT_FOUND. A connection sealed under a previous
 * SAP_CONNECTION_ENCRYPTION_KEY — refused as CONNECTION_UNREADABLE on every
 * northbound call — therefore read as "no active connection with that id" on
 * the one screen built to diagnose it. Same defect class as the Studio test
 * route's bare 500 (R5), one file over.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ResolverModule from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  createEvent: vi.fn(),
  resolveSapConnections: vi.fn(),
  probeConnection: vi.fn(),
  requireOperations: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapConnection: { findFirst: mocks.findFirst, update: mocks.update, findUnique: vi.fn() },
    sapConnectionProbeEvent: { create: mocks.createEvent },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/db/tenant-guard", () => ({ permitCrossTenantReads: vi.fn() }));
vi.mock("@/lib/email/brevo", () => ({ sendEmail: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof ResolverModule>();
  // The sentence stays real — it is the thing the operator reads.
  return { ...actual, resolveSapConnections: mocks.resolveSapConnections };
});
vi.mock("@/lib/studio/connection-health", () => ({
  probeConnection: mocks.probeConnection,
  resolveProbePath: () => "/sap/opu/odata/sap/API_BUSINESS_PARTNER",
}));
vi.mock("@/lib/ops/guard", () => ({ requireOperations: mocks.requireOperations }));

import { probeOneConnection } from "@/lib/ops/connection-probe-sweep";
import { POST } from "@/app/api/ops/connections-health/probe/route";

const ROW = { id: "conn_1", key: "cust", product: "s4hana", environment: "TEST" };
const RESOLVED = { id: "conn_1", key: "cust", product: "s4hana", environment: "TEST", client: null };

function req(body: unknown) {
  return new Request("http://localhost:3003/api/ops/connections-health/probe", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue(ROW);
  mocks.resolveSapConnections.mockResolvedValue([RESOLVED]);
  mocks.probeConnection.mockResolvedValue({ status: "OK", httpStatus: 200, detail: "ok", durationMs: 12 });
  mocks.update.mockResolvedValue({});
  mocks.createEvent.mockResolvedValue({});
  mocks.requireOperations.mockResolvedValue({ ok: true, actor: { kind: "scoped", organizationId: "org_a" } });
});

describe("probeOneConnection tells its three outcomes apart", () => {
  it("probes a readable connection and records the result", async () => {
    const out = await probeOneConnection("org_a", "conn_1", "manual");
    expect(out).toEqual({ outcome: "probed", status: "OK", detail: "ok" });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ connectionId: "conn_1", status: "OK", source: "manual" }) }),
    );
  });

  it("says not-found for a row that is inactive or not in this tenant", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await probeOneConnection("org_a", "conn_x", "manual")).toEqual({ outcome: "not-found" });
    expect(mocks.resolveSapConnections).not.toHaveBeenCalled();
  });

  it("says UNREADABLE — with the resolver's own sentence — when the secrets will not open", async () => {
    // A row sealed under a previous SAP_CONNECTION_ENCRYPTION_KEY: the
    // resolver throws on decrypt, exactly as it does on the northbound path.
    mocks.resolveSapConnections.mockRejectedValue(new Error("Unsupported state or unable to authenticate data"));
    const out = await probeOneConnection("org_a", "conn_1", "manual");
    expect(out.outcome).toBe("unreadable");
    if (out.outcome === "unreadable") {
      expect(out.detail).toMatch(/could not be read/);
      expect(out.detail).toMatch(/Re-save the connection's secrets in Studio/);
      // Never the crypto library's own words, and never a host.
      expect(out.detail).not.toMatch(/authenticate data|https?:\/\//);
    }
  });

  it("writes NO health status and NO probe event when nothing was probed", async () => {
    // No probe ran, so there is no tenant fact to record — the same rule the
    // Studio test route (R5) applies. A written status here would be a verdict
    // about a tenant nobody reached.
    mocks.resolveSapConnections.mockRejectedValue(new Error("boom"));
    await probeOneConnection("org_a", "conn_1", "manual");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it("treats a row the resolver does not return as unreadable, not as missing", async () => {
    mocks.resolveSapConnections.mockResolvedValue([]);
    const out = await probeOneConnection("org_a", "conn_1", "manual");
    expect(out.outcome).toBe("unreadable");
    if (out.outcome === "unreadable") expect(out.detail).toMatch(/active but could not be resolved/);
  });
});

describe("the route renders each outcome as itself", () => {
  it("404 for not-found, with no hint about other tenants", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const res = await POST(req({ connectionId: "conn_x" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("No active connection with that id.");
    expect(body.error.message).not.toMatch(/could not be resolved/);
  });

  it("409 with the actionable sentence for an unreadable row — no longer a 404", async () => {
    mocks.resolveSapConnections.mockRejectedValue(new Error("decrypt failed"));
    const res = await POST(req({ connectionId: "conn_1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/Re-save the connection's secrets in Studio, or deactivate the broken row/);
  });

  it("200 with the probe result when it ran", async () => {
    const res = await POST(req({ connectionId: "conn_1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ connectionId: "conn_1", status: "OK", detail: "ok", source: "manual" });
  });
});
