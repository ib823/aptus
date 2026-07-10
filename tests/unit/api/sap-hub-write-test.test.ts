import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  logDecision: vi.fn(),
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
vi.mock("@/lib/audit/decision-logger", () => ({ logDecision: mocks.logDecision }));

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
  mocks.requireAdmin.mockResolvedValue({ user: { id: "a", email: "a@b.co", role: "platform_admin" } });
  mocks.getSapTenant.mockReturnValue({ key: "TEN1", label: "Test Ring", baseUrl: "https://x.example" });
  mocks.getSapService.mockReturnValue({ key: "SVC1", label: "S", scenario: "", path: "/p", domain: "" });
  mocks.inspectSapServiceMetadata.mockResolvedValue({
    entitySets: [],
    flavor: "v2",
    entityCapabilities: [{ name: "A_TestEntity", readable: true, creatable: true, updatable: true, deletable: true, pageable: true }],
  });
  mocks.runCapabilityWriteTest.mockResolvedValue({ created: true, deleted: true, createStatus: 201, deleteStatus: 204, location: "/x(1)", ladder: "writable" });
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

  it("403 when $metadata does not confirm creatable AND deletable", async () => {
    mocks.inspectSapServiceMetadata.mockResolvedValue({
      entitySets: [],
      flavor: "v2",
      entityCapabilities: [{ name: "A_TestEntity", readable: true, creatable: true, updatable: true, deletable: false, pageable: true }],
    });
    expect((await POST(makeRequest(VALID))).status).toBe(403);
    expect(mocks.runCapabilityWriteTest).not.toHaveBeenCalled();
  });

  it("happy path: full guard + creatable&deletable → create-then-delete + audit", async () => {
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ created: true, deleted: true, ladder: "writable" });
    expect(mocks.runCapabilityWriteTest).toHaveBeenCalledOnce();
    expect(mocks.logDecision).toHaveBeenCalledOnce();
    expect(mocks.logDecision.mock.calls[0]![0]).toMatchObject({ action: "SAP_WRITE_TEST_PERFORMED", entityType: "sap_write_test" });
  });
});
