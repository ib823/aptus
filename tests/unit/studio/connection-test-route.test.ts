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
 *
 * 3. (P0.2 review round 4) It opened only the named row, so on a product whose
 *    group the broker refuses (a sibling will not open) it probed SAP and wrote
 *    a fresh OK over GROUP_UNREADABLE. It now opens the group, as "Probe now"
 *    does; the real-database proof is tests/integration/connection-probe-resave.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Type-only, so it is erased before vi.mock hoisting and never loads the module.
import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstConnection: vi.fn(),
  findManyConnections: vi.fn(),
  updateConnection: vi.fn(),
  createProbeEvent: vi.fn(),
  resolveSapConnection: vi.fn(),
  resolveSapConnections: vi.fn(),
  probeConnection: vi.fn(),
  writeConfigAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    // The status write is guarded by the revision the probe read through.
    sapConnection: {
      findFirst: mocks.findFirstConnection,
      findMany: mocks.findManyConnections,
      updateMany: mocks.updateConnection,
    },
    sapConnectionProbeEvent: { create: mocks.createProbeEvent },
  },
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionResolverModule>()),
  resolveSapConnection: mocks.resolveSapConnection,
  resolveSapConnections: mocks.resolveSapConnections,
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
vi.mock("@/lib/email/brevo", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/studio/connection-health", () => ({ probeConnection: mocks.probeConnection }));
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: mocks.writeConfigAudit }));

import { POST } from "@/app/api/studio/connections/[id]/test/route";

const BUILDER = { id: "u_1", email: "a@abeam.com", role: "consultant", organizationId: "org_a" };
const ROW = { id: "conn_1", product: "s4hana", key: "acme-dev", label: "Acme DEV", environment: "DEV" };
const RESOLVED = { id: "conn_1", key: "acme-dev", baseUrl: "https://x.example", secrets: {}, revision: 3 };

const call = () =>
  POST(new Request("http://localhost/api/studio/connections/conn_1/test", { method: "POST" }) as never, {
    params: Promise.resolve({ id: "conn_1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findFirstConnection.mockResolvedValue(ROW);
  mocks.resolveSapConnection.mockResolvedValue(RESOLVED);
  mocks.resolveSapConnections.mockResolvedValue([RESOLVED]);
  mocks.findManyConnections.mockResolvedValue([
    { id: "conn_1", key: "acme-dev", label: "Acme DEV", lastValidationStatus: "OK", revision: 3 },
  ]);
  mocks.updateConnection.mockResolvedValue({ count: 1 });
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
  /** This row's own secret will not open: the group throws, and so does the row on its own. */
  function ownSecretBroken(err = new Error("Unsupported state or unable to authenticate data")) {
    mocks.resolveSapConnections.mockRejectedValue(err);
    mocks.resolveSapConnection.mockRejectedValue(err);
  }

  it("is a refusal with a sentence, not a 500 with a stack trace", async () => {
    ownSecretBroken();
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    // The resolver's own sentence for this case — the one the northbound path
    // already uses — so both surfaces say the same thing about the same row.
    expect(body.error.message).toMatch(/could not be read/i);
    expect(body.error.message).toMatch(/Re-save the connection/i);
  });

  it("runs no probe and records no probe outcome — only UNREADABLE, with no success time", async () => {
    ownSecretBroken(new Error("decrypt failed"));
    await call();
    expect(mocks.probeConnection).not.toHaveBeenCalled();
    expect(mocks.createProbeEvent).not.toHaveBeenCalled();
    expect(mocks.updateConnection).toHaveBeenCalledTimes(1);
    const write = mocks.updateConnection.mock.calls[0]![0];
    expect(write.where).toMatchObject({ id: "conn_1", organizationId: "org_a", revision: 3 });
    expect(write.data).toEqual({ lastValidationStatus: "UNREADABLE" });
  });

  it("does not put the error text in the response", async () => {
    ownSecretBroken(new Error("SECRET-SHAPED-DETAIL xyz"));
    const body = await (await call()).json();
    expect(JSON.stringify(body)).not.toContain("SECRET-SHAPED-DETAIL");
  });

  it("a sibling that will not open: GROUP_UNREADABLE, the sibling named, and SAP never asked (round 4)", async () => {
    // The broker refuses every call for the product; a 200 from SAP for this
    // row must not be recorded as its health.
    mocks.resolveSapConnections.mockRejectedValue(new Error("decrypt failed"));
    mocks.findManyConnections.mockResolvedValue([
      { id: "conn_1", key: "acme-dev", label: "Acme DEV", lastValidationStatus: "OK", revision: 3 },
      { id: "conn_2", key: "acme-qa", label: "Acme QA", lastValidationStatus: null, revision: 1 },
    ]);
    mocks.resolveSapConnection.mockImplementation(async (_org: string, _product: string, key: string) => {
      if (key === "acme-qa") throw new Error("decrypt failed");
      return RESOLVED;
    });

    const res = await call();

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/another active connection for this product/i);
    expect(body.error.message).toContain('"Acme QA"');
    expect(mocks.probeConnection).not.toHaveBeenCalled();
    expect(mocks.createProbeEvent).not.toHaveBeenCalled();
    expect(mocks.updateConnection).toHaveBeenCalledTimes(1);
    expect(mocks.updateConnection.mock.calls[0]![0].where.id).toBe("conn_1");
    expect(mocks.updateConnection.mock.calls[0]![0].data).toEqual({ lastValidationStatus: "GROUP_UNREADABLE" });
  });

  it("the status it records names the builder in the audit, as every other path does (round 5)", async () => {
    // Recording UNREADABLE changes the row on every screen and raises the
    // unhealthy-connection incident: "who flipped it at 14:07" must have an
    // answer. No request reached SAP, and the row says so.
    ownSecretBroken();
    await call();
    expect(mocks.writeConfigAudit).toHaveBeenCalledTimes(1);
    expect(mocks.writeConfigAudit).toHaveBeenCalledWith({
      organizationId: "org_a",
      actorId: "u_1",
      entityType: "Connection",
      entityId: "conn_1",
      action: "TEST_CONNECT",
      after: { status: "UNREADABLE", reachedSap: false },
    });
  });

  it("nothing recorded (re-saved meanwhile): no status change, so no audit row", async () => {
    ownSecretBroken();
    mocks.updateConnection.mockResolvedValue({ count: 0 });
    mocks.findFirstConnection.mockImplementation(async (args: { select?: Record<string, boolean> }) =>
      args.select?.revision ? { lastValidationStatus: "OK", revision: 4 } : ROW,
    );
    const res = await call();
    expect(res.status).toBe(409);
    expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
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

describe("a re-save while the test runs (P0.2 review)", () => {
  it("writes the status only while the row holds the settings that were probed", async () => {
    await call();
    expect(mocks.updateConnection.mock.calls[0]![0].where).toEqual({ id: "conn_1", organizationId: "org_a", revision: 3 });
  });

  it("records nothing about the new settings, and says the test must be run again", async () => {
    // The row was re-saved mid-probe: the revision moved, the guarded write
    // matches nothing, and the old tenant's 200 must not read as the new
    // settings' health — nor enter their probe history (the event is written
    // under a source the history readers skip; see below).
    mocks.updateConnection.mockResolvedValue({ count: 0 });
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/changed while it was being tested/i);
    expect(mocks.createProbeEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: "test" }) }),
    );
  });

  it("still leaves the trace that a person sent a request to SAP (round 3)", async () => {
    // The probe reached the client's SAP system with the old settings. Who
    // caused it must be answerable: the audit row names the builder and says
    // the result was superseded, and the probe event is kept, marked so the
    // drift baseline and incident history skip it.
    mocks.updateConnection.mockResolvedValue({ count: 0 });
    await call();
    expect(mocks.writeConfigAudit).toHaveBeenCalledTimes(1);
    expect(mocks.writeConfigAudit).toHaveBeenCalledWith({
      organizationId: "org_a",
      actorId: "u_1",
      entityType: "Connection",
      entityId: "conn_1",
      action: "TEST_CONNECT",
      after: { status: "OK", httpStatus: 200, durationMs: 12, superseded: true },
    });
    expect(mocks.createProbeEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createProbeEvent).toHaveBeenCalledWith({
      data: {
        organizationId: "org_a",
        connectionId: "conn_1",
        status: "OK",
        httpStatus: 200,
        durationMs: 12,
        source: "test:superseded",
      },
    });
  });
});

describe("what did not change", () => {
  it("a connection in another organization is not found", async () => {
    mocks.findFirstConnection.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(mocks.resolveSapConnections).not.toHaveBeenCalled();
  });

  it("an oversight role may look but not probe", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...BUILDER, role: "platform_admin" });
    const res = await call();
    expect(res.status).toBe(403);
    expect(mocks.probeConnection).not.toHaveBeenCalled();
  });
});
