import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PlatformAudit from "@/lib/audit/platform-audit";

const mocks = vi.hoisted(() => ({
  isSapTddWriteEnabled: vi.fn(),
  getSapTddWriteSecretRequired: vi.fn(() => true),
  // Reads the per-product WRITE_SECRET env at call time (prefix "S4_TDD" →
  // process.env.S4_TDD_WRITE_SECRET), mirroring the real connector so the
  // fail-closed env-var test cases below keep exercising real behaviour.
  getSapTddWriteSecret: vi.fn((prefix: string) => process.env[`${prefix}_WRITE_SECRET`]),
  // Multi-product resolver: empty/absent → default s4hana product (S4_TDD).
  getSapProduct: vi.fn((v: string) =>
    !v || v === "s4hana"
      ? { key: "s4hana", label: "SAP S/4HANA Cloud", envPrefix: "S4_TDD" }
      : null,
  ),
  getSapTenant: vi.fn((_prefix: string, v: string) => (v ? { key: v, label: `Tenant ${v}` } : null)),
  getSapService: vi.fn((_product: unknown, v: string) => (v ? { key: v, path: `/sap/opu/odata/sap/${v}` } : null)),
  createSapEntitySetRecord: vi.fn(),
  requireAdmin: vi.fn(),
  beginPlatformAudit: vi.fn(),
  completePlatformAudit: vi.fn(),
  // Every call, in order, so "audited BEFORE SAP" is an assertion, not a hope.
  calls: [] as string[],
}));

vi.mock("@/lib/sap-public/tdd-connector", () => ({
  isSapTddWriteEnabled: mocks.isSapTddWriteEnabled,
  getSapTddWriteSecretRequired: mocks.getSapTddWriteSecretRequired,
  getSapTddWriteSecret: mocks.getSapTddWriteSecret,
  getSapProduct: mocks.getSapProduct,
  getSapTenant: mocks.getSapTenant,
  getSapService: mocks.getSapService,
  createSapEntitySetRecord: mocks.createSapEntitySetRecord,
}));

// The real outcome mapping and 503 response; only the two database writes are stand-ins.
vi.mock("@/lib/audit/platform-audit", async (importActual) => ({
  ...(await importActual<typeof PlatformAudit>()),
  beginPlatformAudit: mocks.beginPlatformAudit,
  completePlatformAudit: mocks.completePlatformAudit,
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  isAdminError: (r: unknown) =>
    typeof r === "object" && r !== null && "status" in (r as Record<string, unknown>),
}));

const { POST, GET } = await import("@/app/api/sap/tdd/write/route");

const VALID_BODY = {
  tenant: "TEN1",
  service: "SVC1",
  entity: "Customer",
  payload: { Name: "Acme" },
  confirmation: "WRITE TO SAP TDD",
};

function makeRequest(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

const ADMIN = { id: "admin-1", email: "admin@abeam.test", role: "platform_admin", organizationId: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls = [];
  mocks.isSapTddWriteEnabled.mockReturnValue(true);
  mocks.requireAdmin.mockResolvedValue({ user: ADMIN });
  mocks.createSapEntitySetRecord.mockImplementation(async () => {
    mocks.calls.push("sap");
    return { ok: true, status: 201 };
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
  vi.restoreAllMocks();
});

describe("POST /api/sap/tdd/write", () => {
  it("rejects when SAP TDD write-back is disabled", async () => {
    mocks.isSapTddWriteEnabled.mockReturnValue(false);
    const res = await POST(makeRequest({ ...VALID_BODY, writeSecret: "x" }));
    expect(res.status).toBe(403);
    expect(mocks.createSapEntitySetRecord).not.toHaveBeenCalled();
  });

  // Regression: prior validateWriteSecret returned true on missing env,
  // letting unauthenticated callers reach createSapEntitySetRecord.
  it("fails closed when S4_TDD_WRITE_SECRET is unset", async () => {
    delete process.env.S4_TDD_WRITE_SECRET;
    const res = await POST(makeRequest({ ...VALID_BODY, writeSecret: "anything" }));
    expect(res.status).toBe(403);
    expect(mocks.createSapEntitySetRecord).not.toHaveBeenCalled();
  });

  it("rejects when admin guard fails", async () => {
    mocks.requireAdmin.mockResolvedValue({ status: 401 });
    process.env.S4_TDD_WRITE_SECRET = "secret-value";
    const res = await POST(makeRequest({ ...VALID_BODY, writeSecret: "secret-value" }));
    expect(res.status).toBe(401);
    expect(mocks.createSapEntitySetRecord).not.toHaveBeenCalled();
  });

  it("rejects when the write secret does not match", async () => {
    process.env.S4_TDD_WRITE_SECRET = "secret-value";
    const res = await POST(makeRequest({ ...VALID_BODY, writeSecret: "wrong" }));
    expect(res.status).toBe(403);
    expect(mocks.createSapEntitySetRecord).not.toHaveBeenCalled();
  });

  it("rejects when the secret has the wrong type", async () => {
    process.env.S4_TDD_WRITE_SECRET = "secret-value";
    const res = await POST(makeRequest({ ...VALID_BODY, writeSecret: 12345 }));
    expect(res.status).toBe(403);
  });

  it("rejects when the confirmation phrase is missing", async () => {
    process.env.S4_TDD_WRITE_SECRET = "secret-value";
    const res = await POST(
      makeRequest({ ...VALID_BODY, confirmation: "wrong", writeSecret: "secret-value" }),
    );
    expect(res.status).toBe(400);
  });

  it("succeeds when admin + secret + confirmation all match", async () => {
    process.env.S4_TDD_WRITE_SECRET = "secret-value";
    const res = await POST(makeRequest({ ...VALID_BODY, writeSecret: "secret-value" }));
    expect(res.status).toBe(200);
    expect(mocks.createSapEntitySetRecord).toHaveBeenCalledOnce();
  });
});

/*
 * P0.7 — the write-back left no audit row at all. These pin the contract: a row
 * naming the person BEFORE SAP is called, nothing sent if it cannot be written,
 * and the outcome recorded after.
 */
describe("POST /api/sap/tdd/write — audited before SAP is called (P0.7)", () => {
  beforeEach(() => {
    process.env.S4_TDD_WRITE_SECRET = "secret-value";
  });

  it("records the write, naming the person and the target, before the SAP call", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, writeSecret: "secret-value" }));
    expect(res.status).toBe(200);
    expect(mocks.calls).toEqual(["audit:begin", "sap", "audit:complete"]);
    expect(mocks.beginPlatformAudit).toHaveBeenCalledWith({
      action: "SAP_WORKBENCH_WRITE",
      actor: { id: "admin-1", email: "admin@abeam.test", role: "platform_admin", organizationId: null },
      target: {
        product: "s4hana",
        tenantKey: "TEN1",
        tenantLabel: "Tenant TEN1",
        serviceKey: "SVC1",
        servicePath: "/sap/opu/odata/sap/SVC1",
        entitySet: "Customer",
      },
      payload: { Name: "Acme" },
    });
    // The person is handed the id that finds their row.
    expect(res.headers.get("x-correlation-id")).toBe("corr-1");
  });

  it("sends NOTHING to SAP when the audit row cannot be written, and says so (503)", async () => {
    const { PlatformAuditUnavailableError } = await vi.importActual<typeof PlatformAudit>("@/lib/audit/platform-audit");
    mocks.beginPlatformAudit.mockRejectedValue(new PlatformAuditUnavailableError(new Error("db down")));
    const res = await POST(makeRequest({ ...VALID_BODY, writeSecret: "secret-value" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AUDIT_UNAVAILABLE");
    expect(mocks.createSapEntitySetRecord).not.toHaveBeenCalled();
    expect(mocks.completePlatformAudit).not.toHaveBeenCalled();
  });

  it("records SUCCEEDED with SAP's status when SAP accepts the create", async () => {
    await POST(makeRequest({ ...VALID_BODY, writeSecret: "secret-value" }));
    expect(mocks.completePlatformAudit).toHaveBeenCalledWith(
      { id: "pae_1", correlationId: "corr-1" },
      expect.objectContaining({ outcome: "SUCCEEDED", sapStatus: 201 }),
    );
  });

  it("records SAP_REFUSED for a 4xx — SAP answered, nothing was written", async () => {
    mocks.createSapEntitySetRecord.mockResolvedValue({ ok: false, status: 400 });
    const res = await POST(makeRequest({ ...VALID_BODY, writeSecret: "secret-value" }));
    expect(res.status).toBe(502);
    expect(mocks.completePlatformAudit.mock.calls[0]![1]).toMatchObject({
      outcome: "SAP_REFUSED",
      sapStatus: 400,
      reason: "HTTP_400",
    });
  });

  it("records OUTCOME_UNKNOWN for a 5xx — the write may have been applied", async () => {
    mocks.createSapEntitySetRecord.mockResolvedValue({ ok: false, status: 504 });
    await POST(makeRequest({ ...VALID_BODY, writeSecret: "secret-value" }));
    expect(mocks.completePlatformAudit.mock.calls[0]![1]).toMatchObject({ outcome: "OUTCOME_UNKNOWN", sapStatus: 504 });
  });

  it("records OUTCOME_UNKNOWN when the SAP call throws, and still answers 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createSapEntitySetRecord.mockRejectedValue(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));
    const res = await POST(makeRequest({ ...VALID_BODY, writeSecret: "secret-value" }));
    expect(res.status).toBe(502);
    expect(res.headers.get("x-correlation-id")).toBe("corr-1");
    expect(mocks.completePlatformAudit.mock.calls[0]![1]).toMatchObject({
      outcome: "OUTCOME_UNKNOWN",
      reason: "ECONNRESET",
    });
  });

  it("writes no audit row for a request refused before the target is resolved", async () => {
    // Refused at the guard: SAP is never in reach, and there is nothing to audit.
    await POST(makeRequest({ ...VALID_BODY, writeSecret: "wrong" }));
    await POST(makeRequest({ ...VALID_BODY, entity: "", writeSecret: "secret-value" }));
    expect(mocks.beginPlatformAudit).not.toHaveBeenCalled();
    expect(mocks.createSapEntitySetRecord).not.toHaveBeenCalled();
  });
});

describe("WS2a — GET /api/sap/tdd/write returns only capability flags (no confirmation phrase)", () => {
  it("returns { enabled, writeSecretRequired } and NOT confirmationPhrase", async () => {
    mocks.isSapTddWriteEnabled.mockReturnValue(true);
    mocks.getSapTddWriteSecretRequired.mockReturnValue(true);
    const req = { nextUrl: { searchParams: new URLSearchParams("product=s4hana") } } as Parameters<typeof GET>[0];
    const body = await (await GET(req)).json();
    expect(body.data).toEqual({ enabled: true, writeSecretRequired: true });
    expect(body.data).not.toHaveProperty("confirmationPhrase");
  });
});
