// @vitest-environment node
/**
 * The Workbench preview's circuit (P0.14 review): a caller-chosen query can
 * neither open another organization's circuit nor the production one.
 *
 * On the preview the builder chooses the entity set. So:
 *
 *   - SAP's own 4xx answer to it (a parameterised set asked without its
 *     parameters, an entity set the arrangement does not release) is the
 *     question's fault, not the system's: it never counts as a failure, though
 *     the audit row still records it as 502 (console-read-failure.ts).
 *   - A deployment tenant (S4_TDD_*) belongs to no organization and every
 *     organization may preview it, so its console circuit is per organization:
 *     what org A's previews do to it cannot refuse org B's.
 *   - A stored connection's console circuit is not the circuit the northbound
 *     data and write routes use: a builder's previews cannot refuse the
 *     deployed application's production calls.
 *
 * With the breaker enforcing, as the runbook tells operators to switch it on.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConsoleReadGuard from "@/lib/sap-public/console-read-guard";
import type * as TddConnector from "@/lib/sap-public/tdd-connector";
import type { ResolvedReadTenant } from "@/lib/sap-public/tenant-for-read";
import type * as TenantForRead from "@/lib/sap-public/tenant-for-read";
import { SapHttpError } from "@/lib/sap-public/upstream-failure";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveReadTenant: vi.fn(),
  previewSapEntitySet: vi.fn(),
  recordConsoleRead: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { sapHubContent: { findFirst: async () => null } } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/sap-public/probe-guard", () => ({ refuseUnlessMayProbeTenant: async () => null }));
vi.mock("@/lib/coreedge/journey", () => ({ noteFirstCall: async () => undefined }));
vi.mock("@/lib/sap-public/tenant-for-read", async (importOriginal) => ({
  ...(await importOriginal<typeof TenantForRead>()),
  resolveReadTenant: mocks.resolveReadTenant,
}));
vi.mock("@/lib/sap-public/console-read-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof ConsoleReadGuard>()),
  decideConsoleRead: async () => ({ allowed: true, refusal: null, message: null }),
  recordConsoleRead: mocks.recordConsoleRead,
}));
vi.mock("@/lib/sap-public/tdd-connector", async (importOriginal) => ({
  ...(await importOriginal<typeof TddConnector>()),
  previewSapEntitySet: mocks.previewSapEntitySet,
}));

const preview = await import("@/app/api/sap/tdd/preview/route");
const { __setGovernedCircuitStore, circuitKeyForConnection, governedCircuitBreaker } = await import("@/lib/governed/containment");
const { FAILURE_THRESHOLD, MemoryCircuitStore } = await import("@/lib/northbound/circuit-breaker");

const DEPLOYMENT: ResolvedReadTenant = {
  tenant: { key: "demo", label: "Demo", baseUrl: "https://demo.example" },
  source: "deployment",
  connection: null,
} as ResolvedReadTenant;
const STORED: ResolvedReadTenant = {
  tenant: { key: "dev", label: "Acme DEV", baseUrl: "https://acme-dev.example" },
  source: "connection",
  connection: { id: "conn_dev", environment: "DEV" },
} as ResolvedReadTenant;

const as = (organizationId: string) =>
  mocks.getCurrentUser.mockResolvedValue({ id: `u_${organizationId}`, role: "consultant", organizationId, email: "c@a.co" });
const answered = (status: number) =>
  mocks.previewSapEntitySet.mockResolvedValue({
    ok: status === 200,
    status,
    durationMs: 1,
    rows: status === 200 ? [{ a: 1 }] : [],
    fields: [],
    nextLink: null,
  });
const run = async (tenant: string) => {
  const res = await preview.GET({
    nextUrl: new URL(`http://localhost/api/sap/tdd/preview?product=s4hana&tenant=${tenant}&service=purchase-orders&entity=A_PurchaseOrder`),
  } as never);
  return { status: res.status, body: (await res.json()) as { error?: { code: string } } };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "enforce");
  __setGovernedCircuitStore(new MemoryCircuitStore({ shared: true }));
  mocks.recordConsoleRead.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterAll(() => {
  __setGovernedCircuitStore(null);
  vi.unstubAllEnvs();
});

describe("SAP's 4xx answers to a builder's own query are not system failures", () => {
  it.each([400, 405, 429])("five previews SAP answered %i leave the circuit closed", async (status) => {
    mocks.resolveReadTenant.mockResolvedValue(DEPLOYMENT);
    as("org_a");
    answered(status);
    for (let i = 0; i < FAILURE_THRESHOLD + 1; i++) expect((await run("demo")).status).toBe(200);
    // Still recorded as the console has always recorded it.
    expect(mocks.recordConsoleRead.mock.calls.at(-1)?.[0]).toMatchObject({ status: 502, failureReason: `HTTP_${status}` });
    answered(200);
    expect((await run("demo")).status).toBe(200);
    as("org_b");
    expect((await run("demo")).status).toBe(200);
  });

  it("nor does a 4xx the connector threw on (a non-JSON error body)", async () => {
    mocks.resolveReadTenant.mockResolvedValue(DEPLOYMENT);
    as("org_a");
    mocks.previewSapEntitySet.mockRejectedValue(new SapHttpError("Preview returned non-JSON response: HTTP 400", 400));
    for (let i = 0; i < FAILURE_THRESHOLD + 1; i++) expect((await run("demo")).status).toBe(502);
    answered(200);
    expect((await run("demo")).status).toBe(200);
  });

  it("a 5xx still counts: the console's own circuit opens for the organization that saw it", async () => {
    mocks.resolveReadTenant.mockResolvedValue(DEPLOYMENT);
    as("org_a");
    answered(500);
    for (let i = 0; i < FAILURE_THRESHOLD; i++) expect((await run("demo")).status).toBe(200);
    const refused = await run("demo");
    expect(refused.status).toBe(503);
    expect(refused.body.error?.code).toBe("CIRCUIT_OPEN");
  });
});

describe("one organization cannot open another's circuit", () => {
  it("org A's failing previews of the deployment tenant do not refuse org B's", async () => {
    mocks.resolveReadTenant.mockResolvedValue(DEPLOYMENT);
    as("org_a");
    answered(500);
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await run("demo");
    expect((await run("demo")).status).toBe(503);
    as("org_b");
    answered(200);
    const b = await run("demo");
    expect(b.status).toBe(200);
    expect(b.body.error).toBeUndefined();
  });
});

describe("a builder's previews cannot open the production circuit", () => {
  it("five failing previews of a stored connection leave the northbound circuit closed", async () => {
    mocks.resolveReadTenant.mockResolvedValue(STORED);
    as("org_a");
    answered(500);
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await run("dev");
    const production = await governedCircuitBreaker().snapshot(circuitKeyForConnection("conn_dev"));
    expect(production?.state).toBe("closed");
    expect(production?.consecutiveFailures).toBe(0);
    expect((await governedCircuitBreaker().beforeCall(circuitKeyForConnection("conn_dev"))).allowed).toBe(true);
  });
});
