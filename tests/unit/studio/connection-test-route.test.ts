/**
 * POST /api/studio/connections/[id]/test — the two things it got wrong.
 *
 * 1. A connection whose secrets will not open (a rotated encryption key, a
 *    restored backup, a redeploy with a different SAP_CONNECTION_ENCRYPTION_KEY)
 *    made the resolver throw, and the throw escaped as an unhandled 500 with a
 *    stack trace — on the one screen an operator would open to diagnose exactly
 *    that. The northbound path already caught the same throw and answered
 *    CONNECTION_UNREADABLE with a sentence; this route never got the same.
 *
 * 2. Only the cron sweep and the Ops "Probe now" wrote a SapConnectionProbeEvent.
 *    The probe a human runs while actively diagnosing a connection — this one —
 *    left no history in Operations at all.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Type-only, so it is erased before vi.mock hoisting and never loads the module.
import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstConnection: vi.fn(),
  updateConnection: vi.fn(),
  createProbeEvent: vi.fn(),
  resolveSapConnection: vi.fn(),
  probeConnection: vi.fn(),
  writeConfigAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapConnection: { findFirst: mocks.findFirstConnection, update: mocks.updateConnection },
    sapConnectionProbeEvent: { create: mocks.createProbeEvent },
  },
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionResolverModule>()),
  resolveSapConnection: mocks.resolveSapConnection,
}));
vi.mock("@/lib/studio/connection-health", () => ({ probeConnection: mocks.probeConnection }));
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: mocks.writeConfigAudit }));

import { POST } from "@/app/api/studio/connections/[id]/test/route";

const BUILDER = { id: "u_1", email: "a@abeam.com", role: "consultant", organizationId: "org_a" };
const ROW = { id: "conn_1", product: "s4hana", key: "acme-dev", label: "Acme DEV", environment: "DEV" };
const RESOLVED = { id: "conn_1", key: "acme-dev", baseUrl: "https://x.example", secrets: {} };

const call = () =>
  POST(new Request("http://localhost/api/studio/connections/conn_1/test", { method: "POST" }) as never, {
    params: Promise.resolve({ id: "conn_1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findFirstConnection.mockResolvedValue(ROW);
  mocks.resolveSapConnection.mockResolvedValue(RESOLVED);
  mocks.updateConnection.mockResolvedValue({});
  mocks.createProbeEvent.mockResolvedValue({});
  mocks.writeConfigAudit.mockResolvedValue(undefined);
  mocks.probeConnection.mockResolvedValue({
    status: "OK",
    httpStatus: 200,
    detail: "Reachable and authenticated.",
    durationMs: 12,
  });
});

describe("secrets that will not open", () => {
  it("is a refusal with a sentence, not a 500 with a stack trace", async () => {
    mocks.resolveSapConnection.mockRejectedValue(
      new Error("Unsupported state or unable to authenticate data"),
    );
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    // The resolver's own sentence for this case — the one the northbound path
    // already uses — so both surfaces say the same thing about the same row.
    expect(body.error.message).toMatch(/could not be read/i);
    expect(body.error.message).toMatch(/Re-save the connection/i);
  });

  it("never records a health status, because no probe ran", async () => {
    mocks.resolveSapConnection.mockRejectedValue(new Error("decrypt failed"));
    await call();
    expect(mocks.probeConnection).not.toHaveBeenCalled();
    expect(mocks.updateConnection).not.toHaveBeenCalled();
    expect(mocks.createProbeEvent).not.toHaveBeenCalled();
  });

  it("does not put the error text in the response", async () => {
    mocks.resolveSapConnection.mockRejectedValue(new Error("SECRET-SHAPED-DETAIL xyz"));
    const body = await (await call()).json();
    expect(JSON.stringify(body)).not.toContain("SECRET-SHAPED-DETAIL");
  });
});

describe("the manual test leaves a trace", () => {
  it("writes one SapConnectionProbeEvent with source 'test'", async () => {
    await call();
    expect(mocks.createProbeEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createProbeEvent).toHaveBeenCalledWith({
      data: {
        organizationId: "org_a",
        connectionId: "conn_1",
        status: "OK",
        httpStatus: 200,
        durationMs: 12,
        source: "test",
      },
    });
  });

  it("records a failed probe too — the history is of attempts, not successes", async () => {
    mocks.probeConnection.mockResolvedValue({
      status: "ERROR",
      httpStatus: null,
      detail: "The connection could not be established.",
      durationMs: 30,
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(mocks.createProbeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ERROR", source: "test" }) }),
    );
  });

  it("still moves lastValidatedAt only on a real 200", async () => {
    mocks.probeConnection.mockResolvedValue({ status: "ERROR", httpStatus: null, detail: "x", durationMs: 1 });
    await call();
    const data = mocks.updateConnection.mock.calls[0]![0].data;
    expect(data.lastValidationStatus).toBe("ERROR");
    expect(data).not.toHaveProperty("lastValidatedAt");
  });
});

describe("what did not change", () => {
  it("a connection in another organization is not found", async () => {
    mocks.findFirstConnection.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(mocks.resolveSapConnection).not.toHaveBeenCalled();
  });

  it("an oversight role may look but not probe", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...BUILDER, role: "platform_admin" });
    const res = await call();
    expect(res.status).toBe(403);
    expect(mocks.probeConnection).not.toHaveBeenCalled();
  });
});
