// @vitest-environment node
/**
 * A write-test whose DELETE is refused still reports — and audits — the create.
 *
 * Behind a web dispatcher that does not rewrite Location, the create answers
 * 201 with `Location: http://internal-host:8000/...`. deleteSapEntityByLocation
 * refuses that origin before sending anything (so the credentials stay off the
 * internal host), and it does so by throwing SapUrlOriginError. Uncaught in
 * runCapabilityWriteTest, the throw reached the route's outer catch: a bare 502
 * INTERNAL_ERROR, no `created`, no `location`, and no audit row — for a record
 * that WAS created in SAP and is still there. (The audit was a `logDecision`
 * then; since P0.7 it is a PlatformAuditEvent written before SAP is called, and
 * this case is recorded as LEFT_BEHIND.)
 *
 * The real route, the real write-test and the real create/delete; only admin,
 * the audit writes, env/tenant/metadata lookups and `fetch` are stand-ins.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as PlatformAudit from "@/lib/audit/platform-audit";
import type * as Connector from "@/lib/sap-public/tdd-connector";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  beginPlatformAudit: vi.fn(async () => ({ id: "pae_1", correlationId: "corr-1" })),
  completePlatformAudit: vi.fn(),
  getSapTenant: vi.fn(),
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  isAdminError: (r: unknown) => typeof r === "object" && r !== null && "status" in (r as Record<string, unknown>),
}));
vi.mock("@/lib/audit/platform-audit", async (importActual) => ({
  ...(await importActual<typeof PlatformAudit>()),
  beginPlatformAudit: mocks.beginPlatformAudit,
  completePlatformAudit: mocks.completePlatformAudit,
}));
vi.mock("@/lib/sap-public/tdd-connector", async (importActual) => ({
  ...(await importActual<typeof Connector>()),
  getSapProduct: () => ({ key: "s4hana", label: "S/4", envPrefix: "S4_TDD" }),
  isSapTddWriteEnabled: () => true,
  getSapTddWriteSecret: () => "secret-value",
  getSapTenant: mocks.getSapTenant,
  getSapService: () => ({ key: "bp", label: "BP", scenario: "", path: SERVICE_PATH, domain: "" }),
  inspectSapServiceMetadata: async () => ({
    entitySets: [],
    flavor: "v2",
    entityCapabilities: [
      { name: "A_BusinessPartner", readable: true, creatable: true, updatable: true, deletable: true, pageable: true },
    ],
  }),
}));

const { POST } = await import("@/app/api/sap/tdd/hub-content/write-test/route");

const BASE = "https://my403706-api.s4hana.cloud.sap";
const SERVICE_PATH = "/sap/opu/odata/sap/API_BUSINESS_PARTNER";
const INTERNAL = "http://internal-host:8000";

const VALID = {
  product: "s4hana",
  tenant: "TEN1",
  service: "bp",
  entity: "A_BusinessPartner",
  payload: { BusinessPartnerCategory: "1" },
  confirmation: "WRITE TO SAP TDD",
  writeSecret: "secret-value",
};

let fetchMock: ReturnType<typeof vi.fn>;

/** SAP answering the create the way a non-rewriting dispatcher passes it on. */
function sapAnswers(location: string) {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return new Response('{"d":{}}', {
        status: 201,
        headers: { location, "content-type": "application/json" },
      });
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return new Response("", { status: 200, headers: { "x-csrf-token": "tok" } });
  });
  vi.stubGlobal("fetch", fetchMock);
}

function makeRequest(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as Parameters<typeof POST>[0];
}

const methods = () => fetchMock.mock.calls.map(([, init]) => (init as RequestInit | undefined)?.method ?? "GET");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.S4_TDD_WRITE_TEST_ENABLED = "true";
  process.env.S4_TDD_WRITE_TEST_ENTITYSETS = "A_BusinessPartner";
  mocks.requireAdmin.mockResolvedValue({ user: { id: "a", email: "a@b.co", role: "platform_admin", organizationId: null } });
  mocks.getSapTenant.mockReturnValue({
    key: "TEN1",
    label: "Test Ring",
    baseUrl: BASE,
    authHeaders: async () => ({ Authorization: "Basic c2VjcmV0" }),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.S4_TDD_WRITE_TEST_ENABLED;
  delete process.env.S4_TDD_WRITE_TEST_ENTITYSETS;
});

describe("a create whose Location names another origin", () => {
  const LOCATION = `${INTERNAL}${SERVICE_PATH}/A_BusinessPartner('1000123')`;

  it("answers 502 WITH the result: created, not deleted, and where the record is", async () => {
    sapAnswers(LOCATION);
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { data?: Record<string, unknown>; error?: unknown };
    expect(body.error).toBeUndefined();
    expect(body.data).toEqual({
      created: true,
      deleted: false,
      createStatus: 201,
      deleteStatus: null,
      location: LOCATION,
      ladder: "writable",
    });
  });

  it("audits the create, so the record left behind is on the record", async () => {
    sapAnswers(LOCATION);
    await POST(makeRequest(VALID));
    expect(mocks.completePlatformAudit).toHaveBeenCalledOnce();
    expect(mocks.completePlatformAudit.mock.calls[0]![1]).toMatchObject({
      outcome: "LEFT_BEHIND",
      sapStatus: 201,
      reason: "DELETE_NOT_SENT",
      // Where the record is, so an operator can find and remove it.
      detail: { created: true, deleted: false, deleteStatus: null, location: LOCATION },
    });
  });

  it("still sends nothing to that origin: the refusal is kept", async () => {
    sapAnswers(LOCATION);
    await POST(makeRequest(VALID));
    // The CSRF fetch and the create, both on the tenant — no DELETE, and no
    // second CSRF fetch for one.
    expect(methods()).toEqual(["GET", "POST"]);
    for (const [url] of fetchMock.mock.calls) expect(String(url).startsWith(BASE)).toBe(true);
  });
});

describe("a create whose Location is the tenant's", () => {
  it("is still created then deleted, and answered 200", async () => {
    sapAnswers(`${BASE}${SERVICE_PATH}/A_BusinessPartner('1000123')`);
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: Record<string, unknown> }).data).toMatchObject({
      created: true,
      deleted: true,
      deleteStatus: 204,
    });
    expect(methods()).toEqual(["GET", "POST", "GET", "DELETE"]);
  });
});
