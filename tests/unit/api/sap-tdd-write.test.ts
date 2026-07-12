import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  getSapTenant: vi.fn((_prefix: string, v: string) => (v ? { id: v } : null)),
  getSapService: vi.fn((_product: unknown, v: string) => (v ? { id: v } : null)),
  createSapEntitySetRecord: vi.fn(),
  requireAdmin: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSapTddWriteEnabled.mockReturnValue(true);
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "platform_admin" } });
  mocks.createSapEntitySetRecord.mockResolvedValue({ ok: true, status: 201 });
});

afterEach(() => {
  delete process.env.S4_TDD_WRITE_SECRET;
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
