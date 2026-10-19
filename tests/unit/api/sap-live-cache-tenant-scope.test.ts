/**
 * The live-SAP cache is filed under the system that answered (audit A00, A22).
 *
 * THE DEFECT. /operations and /entities cache live SAP results for 30 s in a Map
 * shared by every request on the instance. The key was the bare tenant key,
 * `ops:${product}:${tenant.key}`. A connection key is unique only WITHIN an
 * organization, so two organizations that both named a connection "prod" shared
 * one entry. Organization B passed its OWN environment ceiling, hit the cache,
 * and was served organization A's live business rows, entity sets and probe
 * results with `fromCache: true`. B's own system was never contacted, and
 * neither organization's audit trail recorded that A's data went to B.
 *
 * Each case below makes the first request as one organization and the second as
 * another with the same tenant key. The second must reach its own system. The
 * last case in each block shows the cache still works for the same owner, so
 * the fix is not "the cache is off".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConsoleReadGuard from "@/lib/sap-public/console-read-guard";
import type * as TddConnector from "@/lib/sap-public/tdd-connector";
import type { ResolvedReadTenant } from "@/lib/sap-public/tenant-for-read";
import type * as TenantForRead from "@/lib/sap-public/tenant-for-read";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveReadTenant: vi.fn(),
  previewSapEntitySet: vi.fn(),
  inspectSapService: vi.fn(),
  probeSapEntitySets: vi.fn(),
  recordConsoleRead: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
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

const operations = await import("@/app/api/sap/tdd/operations/route");
const entities = await import("@/app/api/sap/tdd/entities/route");

const viewer = (org: string) => ({ id: `u_${org}`, role: "consultant", organizationId: org, email: `c@${org}.com` });

/** Org-owned connection: same key in every organization, its own row and host. */
function connection(org: string, key: string): ResolvedReadTenant {
  return {
    tenant: { key, label: `${org} ${key}`, baseUrl: `https://${org}.example` },
    source: "connection",
    connection: { id: `conn_${org}_${key}`, environment: "DEV" },
  };
}

/** The deployment's own tenant: one system, whoever asks. */
function deployment(key: string): ResolvedReadTenant {
  return {
    tenant: { key, label: "Demo", baseUrl: "https://demo.example" },
    source: "deployment",
    connection: null,
  };
}

/** Each organization resolves the key to ITS OWN tenant, as resolveReadTenant does. */
function resolveAs(byOrg: (org: string) => ResolvedReadTenant) {
  mocks.resolveReadTenant.mockImplementation(
    async (_prefix: string, _product: string, org: string | null) => byOrg(org ?? "none"),
  );
}

function get(url: string) {
  return { nextUrl: new URL(`http://localhost${url}`) } as never;
}

async function as(org: string, run: () => Promise<Response>) {
  mocks.getCurrentUser.mockResolvedValue(viewer(org));
  const res = await run();
  expect(res.status).toBe(200);
  return (await res.json()).data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordConsoleRead.mockResolvedValue(undefined);
  // Each system answers with its own host in the row, so whose data came back
  // is visible in the response.
  mocks.previewSapEntitySet.mockImplementation(async (_p: string, tenant: { baseUrl: string }) => ({
    ok: true,
    status: 200,
    durationMs: 1,
    rows: [{ Source: tenant.baseUrl }],
  }));
  mocks.inspectSapService.mockImplementation(async (_p: string, tenant: { baseUrl: string }) => ({
    entitySets: [{ name: `Set from ${tenant.baseUrl}` }],
  }));
  mocks.probeSapEntitySets.mockImplementation(async (_p: string, tenant: { baseUrl: string }) => [
    { entitySet: "x", ok: true, status: 200, resultCount: 1, firstResultKeys: [tenant.baseUrl] },
  ]);
});

type Section = { rows: Array<{ Source: string }> };
const sources = (data: { sections: Section[] }) => data.sections.flatMap((s) => s.rows.map((r) => r.Source));

describe("/operations", () => {
  const ops = () => operations.GET(get("/api/sap/tdd/operations?product=s4hana&tenant=prod"));

  it("never serves one organization's cached rows to another with the same key", async () => {
    resolveAs((org) => connection(org, "prod"));

    const a = await as("org_a", ops);
    expect(a.fromCache).toBe(false);

    const b = await as("org_b", ops);
    expect(b.fromCache, "org B was served org A's cached SAP rows").toBe(false);
    expect(sources(b)).not.toContain("https://org_a.example");
    expect(sources(b)).toContain("https://org_b.example");
    // org B's own system was actually read.
    const reached = mocks.previewSapEntitySet.mock.calls.map((c) => (c[1] as { baseUrl: string }).baseUrl);
    expect(reached).toContain("https://org_b.example");
  });

  it("still serves the same organization's repeat from cache", async () => {
    resolveAs((org) => connection(org, "prod-repeat"));
    const url = () => operations.GET(get("/api/sap/tdd/operations?product=s4hana&tenant=prod-repeat"));

    expect((await as("org_a", url)).fromCache).toBe(false);
    const again = await as("org_a", url);
    expect(again.fromCache).toBe(true);
    expect(sources(again)).toContain("https://org_a.example");
  });

  it("shares a deployment tenant's entry across organizations, because it is one system", async () => {
    resolveAs(() => deployment("demo-ops"));
    const url = () => operations.GET(get("/api/sap/tdd/operations?product=s4hana&tenant=demo-ops"));

    expect((await as("org_a", url)).fromCache).toBe(false);
    expect((await as("org_b", url)).fromCache).toBe(true);
  });
});

describe("/entities", () => {
  const ent = (tenant: string) => () =>
    entities.GET(get(`/api/sap/tdd/entities?product=s4hana&tenant=${tenant}&service=purchase-orders&probe=1`));

  it("never serves one organization's entity sets or probes to another with the same key", async () => {
    resolveAs((org) => connection(org, "s4-dev"));

    const a = await as("org_a", ent("s4-dev"));
    expect(a.fromCache).toBe(false);

    const b = await as("org_b", ent("s4-dev"));
    expect(b.fromCache, "org B was served org A's cached metadata").toBe(false);
    expect(b.entitySets[0].name).toBe("Set from https://org_b.example");
    expect(b.probes[0].firstResultKeys).toEqual(["https://org_b.example"]);
    expect(mocks.inspectSapService).toHaveBeenCalledTimes(2);
    // Each organization's read is its own audit row, under its own organization.
    const orgs = mocks.recordConsoleRead.mock.calls.map((c) => (c[0] as { organizationId: string }).organizationId);
    expect(orgs).toContain("org_b");
  });

  it("does not serve a deleted-and-recreated connection the old row's results", async () => {
    // Same organization, same key, a new row id: a different system as far as
    // the cache can know.
    mocks.resolveReadTenant.mockResolvedValueOnce({
      ...connection("org_a", "recreated"),
      connection: { id: "conn_old", environment: "DEV" },
    });
    expect((await as("org_a", ent("recreated"))).fromCache).toBe(false);

    mocks.resolveReadTenant.mockResolvedValueOnce({
      ...connection("org_a", "recreated"),
      connection: { id: "conn_new", environment: "DEV" },
    });
    expect((await as("org_a", ent("recreated"))).fromCache).toBe(false);
  });

  it("still serves the same organization's repeat from cache", async () => {
    resolveAs((org) => connection(org, "s4-repeat"));

    expect((await as("org_a", ent("s4-repeat"))).fromCache).toBe(false);
    expect((await as("org_a", ent("s4-repeat"))).fromCache).toBe(true);
  });
});
