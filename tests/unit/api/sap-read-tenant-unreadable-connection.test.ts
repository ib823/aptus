/**
 * One connection that will not open must not take the console down (audit A27).
 *
 * THE DEFECT. `resolveReadTenant` looked a key up through
 * `resolveSapConnection`, which opened EVERY active row of the organization and
 * product and then picked one. A single row whose secrets would not decrypt (a
 * rotated SAP_CONNECTION_ENCRYPTION_KEY, a restored backup) threw for every key.
 * Every /api/sap/tdd/* route called the resolver outside its try block, so the
 * throw was a 500 with an empty body: the client's `response.json()` failed, the
 * screen showed a parse error, and the healthy connection the user had actually
 * picked could not be used from the console at all.
 *
 * TWO HALVES, BOTH PINNED HERE FOR EVERY ROUTE THAT RESOLVES A TENANT:
 *
 *   - a broken SIBLING is not opened, so the requested connection is read;
 *   - the requested row ITSELF being broken is a 409 with a sentence that says
 *     what to fix, and nothing is sent to SAP.
 *
 * The rows are sealed for real, and the prisma mock ignores the `where` clause
 * and returns both rows, the way the audit reproduced it. A fix that only
 * worked because the database filtered by key would not pass.
 */

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

import type * as AdminGuard from "@/lib/auth/admin-guard";
import type * as CapabilityProbe from "@/lib/sap-public/capability-probe";
import type * as ConsoleReadGuard from "@/lib/sap-public/console-read-guard";
import type * as DynamicCatalog from "@/lib/sap-public/dynamic-catalog";
import type * as HubDependencies from "@/lib/sap-public/hub-dependencies";
import type * as TddConnector from "@/lib/sap-public/tdd-connector";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireAuthenticated: vi.fn(),
  connectionFindMany: vi.fn(),
  hubCount: vi.fn(),
  hubFindUnique: vi.fn(),
  hubFindMany: vi.fn(),
  hubUpdate: vi.fn(),
  previewSapEntitySet: vi.fn(),
  inspectSapService: vi.fn(),
  probeSapEntitySets: vi.fn(),
  probeService: vi.fn(),
  probeTenantCapabilities: vi.fn(),
  recordConsoleRead: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/admin-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof AdminGuard>()),
  requireAuthenticated: mocks.requireAuthenticated,
}));
vi.mock("@/lib/sap-public/probe-guard", () => ({ refuseUnlessMayProbeTenant: async () => null }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 0, resetMs: 0 }),
}));
vi.mock("@/lib/audit/decision-logger", () => ({ logDecision: async () => undefined }));
vi.mock("@/lib/sap-public/capability-audit", () => ({ auditCapabilityProbe: async () => undefined }));
vi.mock("@/lib/sap-public/hub-dependencies", async (importOriginal) => ({
  ...(await importOriginal<typeof HubDependencies>()),
  resolveHubItemDependencies: async () => ({}),
}));
vi.mock("@/lib/sap-public/dynamic-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof DynamicCatalog>()),
  getDynamicOdataServices: async () => [],
}));
vi.mock("@/lib/sap-public/capability-probe", async (importOriginal) => ({
  ...(await importOriginal<typeof CapabilityProbe>()),
  probeService: mocks.probeService,
  probeTenantCapabilities: mocks.probeTenantCapabilities,
}));
vi.mock("@/lib/sap-public/console-read-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof ConsoleReadGuard>()),
  decideConsoleRead: async () => ({ allowed: true, refusal: null, message: null }),
  recordConsoleRead: mocks.recordConsoleRead,
}));
// The live SAP calls only; product, service and tenant resolution stay real.
vi.mock("@/lib/sap-public/tdd-connector", async (importOriginal) => ({
  ...(await importOriginal<typeof TddConnector>()),
  previewSapEntitySet: mocks.previewSapEntitySet,
  inspectSapService: mocks.inspectSapService,
  probeSapEntitySets: mocks.probeSapEntitySets,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapConnection: { findMany: mocks.connectionFindMany },
    sapHubContent: {
      count: mocks.hubCount,
      findUnique: mocks.hubFindUnique,
      findMany: mocks.hubFindMany,
      update: mocks.hubUpdate,
      findFirst: async () => null,
    },
  },
}));

const { connectionAad, sealSecrets } = await import("@/lib/sap-public/connection-crypto");
const preview = await import("@/app/api/sap/tdd/preview/route");
const entities = await import("@/app/api/sap/tdd/entities/route");
const operations = await import("@/app/api/sap/tdd/operations/route");
const capabilities = await import("@/app/api/sap/tdd/capabilities/route");
const hubContent = await import("@/app/api/sap/tdd/hub-content/route");
const hubItem = await import("@/app/api/sap/tdd/hub-content/[id]/route");
const probeAll = await import("@/app/api/sap/tdd/hub-content/probe-all/route");

const ORG = "org_a";
const VIEWER = { id: "u1", role: "consultant", organizationId: ORG, email: "c@abeam.com" };

/** A stored row as Prisma returns it. */
function row(key: string, secretsCiphertext: string) {
  return {
    id: `conn_${key}`,
    organizationId: ORG,
    product: "s4hana",
    key,
    label: `Label ${key}`,
    baseUrl: `https://${key}.example`,
    authType: "basic",
    secretsCiphertext,
    oauthTokenUrl: null,
    writeEnabled: false,
    apiPath: null,
    timeoutMs: null,
    environment: "DEV",
    client: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

let ROWS: ReturnType<typeof row>[] = [];

beforeAll(() => {
  vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  ROWS = [
    // The connection the user picks: sealed properly under its own AAD.
    row("good", sealSecrets({ username: "u", password: "p" }, connectionAad(ORG, "s4hana", "good"))),
    // An old row that no longer opens. Its ciphertext is not even the right length.
    row("old", "garbage"),
  ];
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  // The refusal logs which row could not be opened; that is not under test.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.getCurrentUser.mockResolvedValue(VIEWER);
  mocks.requireAuthenticated.mockResolvedValue({ user: VIEWER });
  // Both rows, whatever was asked for.
  mocks.connectionFindMany.mockImplementation(async () => ROWS);
  mocks.hubCount.mockResolvedValue(0);
  mocks.hubFindUnique.mockResolvedValue({
    id: "1",
    contentType: "API",
    externalId: "API_PO",
    title: "PO",
    description: "",
    packageId: "Proc",
    apiType: "ODATAV2",
    communicationScenarios: [],
    scopeItemCodes: [],
    itemCount: null,
    hubUrl: "u",
    hubState: null,
    rawMetadataJson: null,
  });
  mocks.hubFindMany.mockResolvedValue([
    {
      id: "1",
      externalId: "API_PO",
      contentType: "API",
      apiType: "ODATAV2",
      title: "PO",
      packageId: "Proc",
      communicationScenarios: [],
      rawMetadataJson: null,
    },
  ]);
  mocks.hubUpdate.mockResolvedValue({});
  mocks.previewSapEntitySet.mockResolvedValue({ ok: true, status: 200, durationMs: 1, rows: [{ A: "1" }] });
  mocks.inspectSapService.mockResolvedValue({ entitySets: [{ name: "A_PurchaseOrder" }] });
  mocks.probeSapEntitySets.mockResolvedValue([]);
  mocks.probeService.mockResolvedValue({ service: "API_PO", exposed: true, status: 200, entities: [] });
  mocks.probeTenantCapabilities.mockResolvedValue([]);
  mocks.recordConsoleRead.mockResolvedValue(undefined);
});

function get(url: string) {
  return { nextUrl: new URL(`http://localhost${url}`) } as never;
}

/** Every route that turns a caller's tenant key into a live read, called for one key. */
const ROUTES: Record<string, (tenant: string) => Promise<Response>> = {
  preview: (t) =>
    preview.GET(get(`/api/sap/tdd/preview?product=s4hana&tenant=${t}&service=purchase-orders&entity=A_PurchaseOrder`)),
  entities: (t) => entities.GET(get(`/api/sap/tdd/entities?product=s4hana&tenant=${t}&service=purchase-orders&refresh=1`)),
  operations: (t) => operations.GET(get(`/api/sap/tdd/operations?product=s4hana&tenant=${t}&refresh=1`)),
  capabilities: (t) => capabilities.GET(get(`/api/sap/tdd/capabilities?product=s4hana&tenant=${t}`)),
  "hub-content": (t) => hubContent.GET(get(`/api/sap/tdd/hub-content?product=s4hana&tenant=${t}`)),
  "hub-content/[id]": (t) =>
    hubItem.GET(get(`/api/sap/tdd/hub-content/1?product=s4hana&tenant=${t}`), {
      params: Promise.resolve({ id: "1" }),
    }),
  "probe-all": (t) =>
    probeAll.POST({
      json: async () => ({ confirmation: "PROBE ALL SAP SERVICES", product: "s4hana", tenant: t }),
    } as never),
};

/** The tenant each live SAP mock was handed, across every call this test made. */
function tenantsReached(): string[] {
  return [
    mocks.previewSapEntitySet,
    mocks.inspectSapService,
    mocks.probeService,
    mocks.probeTenantCapabilities,
  ].flatMap((m) => m.mock.calls.map((c) => (c[1] as { baseUrl: string }).baseUrl));
}

describe.each(Object.keys(ROUTES))("%s", (name) => {
  const call = ROUTES[name]!;

  it("reads the requested connection when a different one will not open", async () => {
    const res = await call("good");

    expect(res.status, await res.clone().text()).toBeLessThan(400);
    // hub-content's list answers from the stored catalogue when it is empty and
    // names the tenant instead of calling SAP; every other route calls SAP.
    if (name === "hub-content") {
      expect((await res.json()).data.tenant).toBe("Label good");
    } else {
      expect(tenantsReached()).toContain("https://good.example");
    }
    expect(tenantsReached()).not.toContain("https://old.example");
  });

  it("refuses the broken connection itself with a 409 that says what to fix", async () => {
    const res = await call("old");
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/Re-save the connection's secrets/);
    expect(tenantsReached()).toEqual([]);
  });
});
