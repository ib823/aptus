/**
 * A sandbox developer reads SANDBOX systems and nothing else (roadmap P0.13).
 *
 * The role an open sign-up grants may open Discover and cause live reads, so
 * the read routes cap it: the deployment's own `{PREFIX}_*` tenant included,
 * which the ordinary console ceiling exempts. On a shared host whose
 * deployment tenant is a real S/4HANA system, a stranger's sign-up must not be
 * a live read of it. Every other role keeps the rules it had.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConsoleReadGuard from "@/lib/sap-public/console-read-guard";
import type * as TddConnector from "@/lib/sap-public/tdd-connector";
import type { ResolvedReadTenant } from "@/lib/sap-public/tenant-for-read";
import type * as TenantForRead from "@/lib/sap-public/tenant-for-read";
import { decideSandboxDeveloperRead } from "@/lib/sap-public/console-read-guard";
import { tenantsVisibleTo, type StudioTenant } from "@/lib/studio/tenants";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveReadTenant: vi.fn(),
  previewSapEntitySet: vi.fn(),
  inspectSapService: vi.fn(),
  probeSapEntitySets: vi.fn(),
  recordConsoleRead: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { sapHubContent: { findFirst: async () => null } } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/sap-public/probe-guard", () => ({ refuseUnlessMayProbeTenant: async () => null }));
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
  inspectSapService: mocks.inspectSapService,
  probeSapEntitySets: mocks.probeSapEntitySets,
}));

const preview = await import("@/app/api/sap/tdd/preview/route");
const entities = await import("@/app/api/sap/tdd/entities/route");
const operations = await import("@/app/api/sap/tdd/operations/route");
const capabilities = await import("@/app/api/sap/tdd/capabilities/route");

function deployment(environment?: string): ResolvedReadTenant {
  return {
    tenant: {
      key: "shared",
      label: "Shared tenant",
      baseUrl: "https://sandbox.api.sap.com/s4hanacloud",
      ...(environment ? { environment } : {}),
    },
    source: "deployment",
    connection: null,
  } as ResolvedReadTenant;
}

const CONNECTION_DEV = {
  tenant: { key: "dev", label: "Acme DEV", baseUrl: "https://acme-dev.example" },
  source: "connection",
  connection: { id: "conn_dev", environment: "DEV" },
} as ResolvedReadTenant;

const get = (url: string) => ({ nextUrl: new URL(`http://localhost${url}`) }) as never;
const DEVELOPER = { id: "dev1", role: "sandbox_developer", organizationId: "ws_1", email: "d@example.com" };
const BUILDER = { id: "b1", role: "consultant", organizationId: "org_a", email: "c@a.co" };

const ROUTES = [
  {
    name: "/preview",
    call: () =>
      preview.GET(get("/api/sap/tdd/preview?product=s4hana&tenant=shared&service=purchase-orders&entity=A_PurchaseOrder")),
  },
  {
    name: "/entities",
    call: () => entities.GET(get("/api/sap/tdd/entities?product=s4hana&tenant=shared&service=purchase-orders&refresh=1")),
  },
  { name: "/operations", call: () => operations.GET(get("/api/sap/tdd/operations?product=s4hana&tenant=shared&refresh=1")) },
  { name: "/capabilities", call: () => capabilities.GET(get("/api/sap/tdd/capabilities?product=s4hana&tenant=shared")) },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordConsoleRead.mockResolvedValue(undefined);
  mocks.previewSapEntitySet.mockResolvedValue({ ok: true, status: 200, durationMs: 1, rows: [], fields: [], nextLink: null });
});

describe.each(ROUTES)("$name, for a sandbox developer", (route) => {
  it.each([["TEST"], ["PROD"], [undefined]])(
    "refuses the deployment tenant declared %s, before SAP is asked, and records it",
    async (environment) => {
      mocks.getCurrentUser.mockResolvedValue(DEVELOPER);
      mocks.resolveReadTenant.mockResolvedValue(deployment(environment));

      const res = await route.call();

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { message: string; correlationId: string } };
      expect(body.error.message).toMatch(/reads Sandbox systems only/);
      expect(body.error.correlationId).toBeTruthy();
      expect(mocks.previewSapEntitySet).not.toHaveBeenCalled();
      expect(mocks.inspectSapService).not.toHaveBeenCalled();
      expect(mocks.recordConsoleRead).toHaveBeenCalledWith(expect.objectContaining({ status: 403, actorUserId: "dev1" }));
    },
  );

  it("refuses the workspace's own DEV connection too: Sandbox means SANDBOX", async () => {
    mocks.getCurrentUser.mockResolvedValue(DEVELOPER);
    mocks.resolveReadTenant.mockResolvedValue(CONNECTION_DEV);

    const res = await route.call();

    expect(res.status).toBe(403);
    expect(mocks.previewSapEntitySet).not.toHaveBeenCalled();
  });
});

describe("the ceiling admits what it should", () => {
  it("a sandbox developer reads the deployment tenant declared SANDBOX", async () => {
    mocks.getCurrentUser.mockResolvedValue(DEVELOPER);
    mocks.resolveReadTenant.mockResolvedValue(deployment("SANDBOX"));

    const res = await ROUTES[0].call();

    expect(res.status).toBe(200);
    expect(mocks.previewSapEntitySet).toHaveBeenCalledTimes(1);
  });

  it("a builder still reads an undeclared deployment tenant, as before", async () => {
    mocks.getCurrentUser.mockResolvedValue(BUILDER);
    mocks.resolveReadTenant.mockResolvedValue(deployment());

    const res = await ROUTES[0].call();

    expect(res.status).toBe(200);
    expect(mocks.previewSapEntitySet).toHaveBeenCalledTimes(1);
  });
});

describe("decideSandboxDeveloperRead", () => {
  it("answers allowed for every other role without looking at the tenant", () => {
    for (const role of ["consultant", "platform_admin", "support", null]) {
      expect(decideSandboxDeveloperRead(role, { tenant: {}, connection: null }).allowed).toBe(true);
    }
  });

  it("reads a connection's typed environment and a deployment tenant's declared one", () => {
    expect(
      decideSandboxDeveloperRead("sandbox_developer", { tenant: {}, connection: { environment: "SANDBOX" } }).allowed,
    ).toBe(true);
    expect(
      decideSandboxDeveloperRead("sandbox_developer", { tenant: { environment: "sbx" }, connection: null }).allowed,
    ).toBe(true);
    const refused = decideSandboxDeveloperRead("sandbox_developer", { tenant: { environment: "QA" }, connection: null });
    expect(refused).toMatchObject({ allowed: false, refusal: "SANDBOX_ONLY" });
    expect(refused.message).toMatch(/declared TEST/);
  });
});

describe("the tenant switcher offers a sandbox developer only what it can read", () => {
  const tenants: StudioTenant[] = [
    { key: "tdd", label: "S/4 TDD", product: "s4hana", source: "environment", environment: "TEST" },
    { key: "hub", label: "API Hub sandbox", product: "s4hana", source: "environment", environment: "SANDBOX" },
    { key: "bare", label: "Undeclared", product: "s4hana", source: "environment", environment: null },
  ];

  it("Sandbox tenants only, for a sandbox developer", () => {
    expect(tenantsVisibleTo("sandbox_developer", tenants).map((t) => t.key)).toEqual(["hub"]);
  });

  it("every tenant, for anyone else", () => {
    expect(tenantsVisibleTo("consultant", tenants)).toHaveLength(3);
  });
});
