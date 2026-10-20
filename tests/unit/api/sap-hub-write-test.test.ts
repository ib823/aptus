import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PlatformAudit from "@/lib/audit/platform-audit";
import type * as WriteTestModule from "@/lib/sap-public/capability-write-test";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getSapProduct: vi.fn(),
  isSapTddWriteEnabled: vi.fn(),
  getSapTddWriteSecret: vi.fn((prefix: string) => process.env[`${prefix}_WRITE_SECRET`]),
  getSapTenant: vi.fn(),
  getSapService: vi.fn(),
  inspectSapServiceMetadata: vi.fn(),
  runCapabilityWriteTest: vi.fn(),
  beginPlatformAudit: vi.fn(),
  completePlatformAudit: vi.fn(),
  calls: [] as string[],
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  isAdminError: (r: unknown) => typeof r === "object" && r !== null && "status" in (r as Record<string, unknown>),
}));
vi.mock("@/lib/sap-public/tdd-connector", () => ({
  getSapProduct: mocks.getSapProduct,
  isSapTddWriteEnabled: mocks.isSapTddWriteEnabled,
  getSapTddWriteSecret: mocks.getSapTddWriteSecret,
  getSapTenant: mocks.getSapTenant,
  getSapService: mocks.getSapService,
  inspectSapServiceMetadata: mocks.inspectSapServiceMetadata,
}));
// Keep the real fail-closed guard; mock only the live create-then-delete.
vi.mock("@/lib/sap-public/capability-write-test", async (importActual) => ({
  ...(await importActual<typeof WriteTestModule>()),
  runCapabilityWriteTest: mocks.runCapabilityWriteTest,
}));
// The real outcome mapping and 503 response; only the two database writes are stand-ins.
vi.mock("@/lib/audit/platform-audit", async (importActual) => ({
  ...(await importActual<typeof PlatformAudit>()),
  beginPlatformAudit: mocks.beginPlatformAudit,
  completePlatformAudit: mocks.completePlatformAudit,
}));

const { POST } = await import("@/app/api/sap/tdd/hub-content/write-test/route");

const VALID = {
  product: "s4hana",
  tenant: "TEN1",
  service: "SVC1",
  entity: "A_TestEntity",
  payload: { X: 1 },
  confirmation: "WRITE TO SAP TDD",
  writeSecret: "secret-value",
};
function makeRequest(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.S4_TDD_WRITE_SECRET = "secret-value";
  process.env.S4_TDD_WRITE_TEST_ENABLED = "true";
  process.env.S4_TDD_WRITE_TEST_ENTITYSETS = "A_TestEntity,A_Other";
  mocks.getSapProduct.mockReturnValue({ key: "s4hana", label: "S/4", envPrefix: "S4_TDD" });
  mocks.isSapTddWriteEnabled.mockReturnValue(true);
  mocks.calls = [];
  mocks.requireAdmin.mockResolvedValue({ user: { id: "a", email: "a@b.co", role: "platform_admin", organizationId: null } });
  mocks.getSapTenant.mockReturnValue({ key: "TEN1", label: "Test Ring", baseUrl: "https://x.example" });
  mocks.getSapService.mockReturnValue({ key: "SVC1", label: "S", scenario: "", path: "/p", domain: "" });
  mocks.inspectSapServiceMetadata.mockImplementation(async () => {
    mocks.calls.push("sap:metadata");
    return {
      entitySets: [],
      flavor: "v2",
      entityCapabilities: [{ name: "A_TestEntity", readable: true, creatable: true, updatable: true, deletable: true, pageable: true }],
    };
  });
  mocks.runCapabilityWriteTest.mockImplementation(async () => {
    mocks.calls.push("sap:write-test");
    return { created: true, deleted: true, createStatus: 201, deleteStatus: 204, location: "/x(1)", ladder: "writable" };
  });
  mocks.beginPlatformAudit.mockImplementation(async () => {
    mocks.calls.push("audit:begin");
    return { id: "pae_1", correlationId: "corr-1" };
  });
  mocks.completePlatformAudit.mockImplementation(async () => {
    mocks.calls.push("audit:complete");
  });
});
afterEach(() => {
  delete process.env.S4_TDD_WRITE_SECRET;
  delete process.env.S4_TDD_WRITE_TEST_ENABLED;
  delete process.env.S4_TDD_WRITE_TEST_ENTITYSETS;
});

describe("POST /api/sap/tdd/hub-content/write-test (opt-in, fail-closed)", () => {
  it("403 when write-back is disabled", async () => {
    mocks.isSapTddWriteEnabled.mockReturnValue(false);
    expect((await POST(makeRequest(VALID))).status).toBe(403);
    expect(mocks.runCapabilityWriteTest).not.toHaveBeenCalled();
  });

  it("401 when not admin", async () => {
    mocks.requireAdmin.mockResolvedValue({ status: 401 });
    expect((await POST(makeRequest(VALID))).status).toBe(401);
  });

  it("400 when confirmation phrase is wrong", async () => {
    expect((await POST(makeRequest({ ...VALID, confirmation: "nope" }))).status).toBe(400);
  });

  it("403 when the write secret does not match", async () => {
    expect((await POST(makeRequest({ ...VALID, writeSecret: "wrong" }))).status).toBe(403);
  });

  it("403 when the write-test ring is disabled", async () => {
    delete process.env.S4_TDD_WRITE_TEST_ENABLED;
    expect((await POST(makeRequest(VALID))).status).toBe(403);
    expect(mocks.runCapabilityWriteTest).not.toHaveBeenCalled();
  });

  it("403 when the entity set is not on the ring allowlist", async () => {
    expect((await POST(makeRequest({ ...VALID, entity: "A_NotAllowed" }))).status).toBe(403);
  });

  it("403 when $metadata does not confirm creatable AND deletable — and the attempt is recorded as BLOCKED", async () => {
    mocks.inspectSapServiceMetadata.mockResolvedValue({
      entitySets: [],
      flavor: "v2",
      entityCapabilities: [{ name: "A_TestEntity", readable: true, creatable: true, updatable: true, deletable: false, pageable: true }],
    });
    expect((await POST(makeRequest(VALID))).status).toBe(403);
    expect(mocks.runCapabilityWriteTest).not.toHaveBeenCalled();
    expect(mocks.completePlatformAudit.mock.calls[0]![1]).toMatchObject({
      outcome: "BLOCKED",
      reason: "NOT_CREATABLE_AND_DELETABLE",
    });
  });

  it("502 when the $metadata probe fails — recorded as BLOCKED, no write sent", async () => {
    mocks.inspectSapServiceMetadata.mockRejectedValue(new Error("probe failed"));
    expect((await POST(makeRequest(VALID))).status).toBe(502);
    expect(mocks.runCapabilityWriteTest).not.toHaveBeenCalled();
    expect(mocks.completePlatformAudit.mock.calls[0]![1]).toMatchObject({
      outcome: "BLOCKED",
      reason: "METADATA_PROBE_FAILED",
    });
  });

  it("happy path: full guard + creatable&deletable → create-then-delete + audit", async () => {
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ created: true, deleted: true, ladder: "writable" });
    expect(mocks.runCapabilityWriteTest).toHaveBeenCalledOnce();
    expect(mocks.completePlatformAudit).toHaveBeenCalledOnce();
    expect(mocks.completePlatformAudit.mock.calls[0]![1]).toMatchObject({
      outcome: "SUCCEEDED",
      sapStatus: 201,
      detail: { created: true, deleted: true, deleteStatus: 204, location: "/x(1)" },
    });
    expect(res.headers.get("x-correlation-id")).toBe("corr-1");
  });
});

/*
 * P0.7 — this route recorded its write with a best-effort `logDecision`,
 * AFTER the create-then-delete and swallowed on failure. The row now comes
 * first, names the person, and gates the call.
 */
describe("POST /api/sap/tdd/hub-content/write-test — audited before SAP is called (P0.7)", () => {
  it("records the attempt before ANY SAP call, the $metadata read included", async () => {
    await POST(makeRequest(VALID));
    expect(mocks.calls).toEqual(["audit:begin", "sap:metadata", "sap:write-test", "audit:complete"]);
    expect(mocks.beginPlatformAudit).toHaveBeenCalledWith({
      action: "SAP_WORKBENCH_WRITE_TEST",
      actor: { id: "a", email: "a@b.co", role: "platform_admin", organizationId: null },
      target: {
        product: "s4hana",
        tenantKey: "TEN1",
        tenantLabel: "Test Ring",
        serviceKey: "SVC1",
        servicePath: "/p",
        entitySet: "A_TestEntity",
      },
      payload: { X: 1 },
    });
  });

  it("sends NOTHING to SAP when the audit row cannot be written (503)", async () => {
    const { PlatformAuditUnavailableError } = await vi.importActual<typeof PlatformAudit>("@/lib/audit/platform-audit");
    mocks.beginPlatformAudit.mockRejectedValue(new PlatformAuditUnavailableError(new Error("db down")));
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AUDIT_UNAVAILABLE");
    expect(mocks.inspectSapServiceMetadata).not.toHaveBeenCalled();
    expect(mocks.runCapabilityWriteTest).not.toHaveBeenCalled();
  });

  it("writes no audit row for a request the guard refused", async () => {
    await POST(makeRequest({ ...VALID, writeSecret: "wrong" }));
    expect(mocks.beginPlatformAudit).not.toHaveBeenCalled();
  });

  it("records OUTCOME_UNKNOWN when the write-test throws", async () => {
    mocks.runCapabilityWriteTest.mockRejectedValue(Object.assign(new Error("boom"), { code: "ECONNRESET" }));
    expect((await POST(makeRequest(VALID))).status).toBe(502);
    expect(mocks.completePlatformAudit.mock.calls[0]![1]).toMatchObject({ outcome: "OUTCOME_UNKNOWN", reason: "ECONNRESET" });
  });
});
