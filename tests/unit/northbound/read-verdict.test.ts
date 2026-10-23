// @vitest-environment node
/**
 * Discovery's `callable` is exactly "the data route would serve it" (P0.4, A42).
 *
 * THE DEFECT. `GET /api/northbound/interfaces` advertised `callable: true` for
 * feeds the data route refuses on every call: an interface with no entity set
 * (400), one whose catalogue service does not resolve (400), one with no
 * connection its credential binds to (403). Its predicate was a copy of the
 * grant rules and nothing else, and the agreement test only varied grants, so
 * the disagreement stayed green.
 *
 * THE PROPERTY. For every combination below — interface status, mode, entity
 * set, service, grant state and binding, connection estate, and credential
 * environment — discovery and the real data route are run against the same
 * rows, and:
 *   - `callable` is true exactly when the data route reaches the read;
 *   - when it is false, `refusal` is the reason the data route refused for:
 *     its access refusal, its binding refusal (audited as bindingRefusal), or
 *     its 400 for the definition.
 * Plus: the credential's own state (P0.11 — expired, rotated out, revoked…)
 * is refused identically by both before any of this, and `grantFetchedFor`
 * (discovery's batch filter) agrees with `grantsForInterfaceWhere` (the data
 * route's query) on every grant shape.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ReadModule from "@/lib/northbound/read";
import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    iface: null as null | Record<string, unknown>,
    grants: [] as Record<string, unknown>[],
    connections: [] as Record<string, unknown>[],
    client: null as null | Record<string, unknown>,
    authFailure: null as null | string,
    record: vi.fn(),
    read: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", async () => {
  const { governedQueryRaw } = await import("../../helpers/governed-loads");
  const models = {
    interface: {
      findMany: async () => (mocks.iface ? [{ ...mocks.iface }] : []),
      findFirst: async () => (mocks.iface ? { ...mocks.iface } : null),
    },
    apiAccessGrant: { findMany: async () => mocks.grants.map((g) => ({ ...g })) },
    sapConnection: { findMany: async () => mocks.connections.map((c) => ({ ...c })) },
    sapHubContent: { findFirst: async () => null },
  };
  // The access load is one statement since P0.19, answered through the queries it replaced.
  return { prisma: { ...models, $queryRaw: governedQueryRaw(() => models) } };
});
vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: async () =>
    mocks.authFailure ? { ok: false, reason: mocks.authFailure } : { ok: true, client: mocks.client },
  extractBearer: (h: string | null) => h?.replace(/^Bearer /, "") ?? null,
  touchClientLastUsed: vi.fn(),
}));
vi.mock("@/lib/northbound/auth-failures", () => ({ noteFailedCredential: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  RATE_LIMITS: { northbound: { limit: 60 } },
}));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: mocks.record }));
vi.mock("@/lib/northbound/read", async (importOriginal) => ({
  ...(await importOriginal<typeof ReadModule>()),
  readEntitySet: mocks.read,
}));
// The data route opens the same rows discovery selects on; the SELECTION is
// the real function in both (connection-resolver.ts).
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof ConnectionResolverModule>();
  return {
    ...actual,
    resolveSapConnectionForEnvironment: async (
      _org: string,
      product: string,
      environment: string,
      operation: "READ" | "WRITE",
      sapClient?: string | null,
    ) =>
      actual.selectConnectionForEnvironment(
        mocks.connections
          .filter((c) => c.product === product)
          .map((c) => ({ ...(c as { environment: string | null; client: string | null }), id: c.key, baseUrl: "https://t.example" })),
        environment,
        operation,
        sapClient,
      ),
    // The same selection on the rows the access load read with the interface
    // (P0.19); these rows carry no secrets to open.
    bindStoredConnections: async (
      rows: readonly { environment: string | null; client: string | null; key?: string }[],
      environment: string,
      operation: "READ" | "WRITE",
      sapClient?: string | null,
    ) =>
      actual.selectConnectionForEnvironment(
        rows.map((c) => ({ ...c, id: String(c.key), baseUrl: "https://t.example" })) as never,
        environment,
        operation,
        sapClient,
      ),
    listBindableConnections: async (_org: string, product: string) =>
      mocks.connections.filter((c) => c.product === product).map((c) => ({ ...c })),
  };
});
// The catalogue knows API_BUSINESS_PARTNER and nothing else.
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({
  resolveHubService: async (_p: unknown, key: string) =>
    key === "API_BUSINESS_PARTNER" ? { key, path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" } : null,
}));

import { GET as dataRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { GET as discovery } from "@/app/api/northbound/interfaces/route";
import { grantFetchedFor, grantsForInterfaceWhere } from "@/lib/studio/grant-binding";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const NOW = Date.now();
const LONG_AGO = new Date("2026-01-01T00:00:00Z");
const CUTOFF = new Date("2026-06-01T00:00:00Z");
const PATH = "/sap/opu/odata/sap/ZUI_TRAVEL_O2";

const SERVICES = {
  catalogue: { sapProduct: "s4hana", externalId: "API_BUSINESS_PARTNER", servicePath: null, odataVersion: null },
  "unresolved catalogue": { sapProduct: "s4hana", externalId: "API_NOT_IN_CATALOGUE", servicePath: null, odataVersion: null },
  custom: { sapProduct: "s4hana-onprem", externalId: `custom:${PATH}`, servicePath: PATH, odataVersion: "V2" },
  "invalid custom path": { sapProduct: "s4hana-onprem", externalId: "custom:/a/../b", servicePath: "/a/../b", odataVersion: "V2" },
  "unknown product": { sapProduct: "no-such-product", externalId: "API_BUSINESS_PARTNER", servicePath: null, odataVersion: null },
} as const;

type GrantShape = "none" | "approved, unbound" | "approved, bound" | "bound to another interface" | "sandbox only" | "revoked" | "expired";
const GRANTS: GrantShape[] = ["none", "approved, unbound", "approved, bound", "bound to another interface", "sandbox only", "revoked", "expired"];

function grantFor(shape: GrantShape, iface: { id: string; externalId: string; operation: string; sapProduct: string }) {
  if (shape === "none") return [];
  const base = {
    id: "g1",
    externalId: iface.externalId,
    operation: iface.operation,
    decision: "APPROVED",
    expiresAt: null as Date | null,
    revokedAt: null as Date | null,
    interfaceId: null as string | null,
    sapProduct: null as string | null,
    unboundLastUsedAt: new Date(NOW),
    createdAt: LONG_AGO,
    unboundCutoffAt: CUTOFF,
  };
  switch (shape) {
    case "approved, unbound":
      return [base];
    case "approved, bound":
      return [{ ...base, interfaceId: iface.id, sapProduct: iface.sapProduct }];
    case "bound to another interface":
      return [{ ...base, interfaceId: "if_other", sapProduct: iface.sapProduct }];
    case "sandbox only":
      return [{ ...base, decision: "SANDBOX_ONLY", interfaceId: iface.id, sapProduct: iface.sapProduct }];
    case "revoked":
      return [{ ...base, interfaceId: iface.id, sapProduct: iface.sapProduct, revokedAt: new Date(NOW - 1000) }];
    case "expired":
      return [{ ...base, interfaceId: iface.id, sapProduct: iface.sapProduct, expiresAt: new Date(NOW - 1000) }];
  }
}

const ESTATES: Record<string, (product: string) => Record<string, unknown>[]> = {
  "no connection": () => [],
  "one undeclared": (product) => [{ key: "c1", label: "c1", product, environment: null, client: null }],
  "PROD declared": (product) => [{ key: "c1", label: "c1", product, environment: "PROD", client: null }],
  "two undeclared": (product) => [
    { key: "c1", label: "c1", product, environment: null, client: null },
    { key: "c2", label: "c2", product, environment: null, client: null },
  ],
  "PROD, client 200": (product) => [{ key: "c1", label: "c1", product, environment: "PROD", client: "200" }],
};

const ACCESS_REASONS = new Set([
  "WRITE_NOT_SERVED",
  "INTERFACE_DEPRECATED",
  "NO_APPROVED_GRANT",
  "GRANT_EXPIRED",
  "GRANT_REVOKED",
  "GRANT_NEEDS_REAPPROVAL",
]);
const DEFINITION_REASONS = new Set(["SERVICE_PATH_INVALID", "SERVICE_UNRESOLVED", "NO_ENTITY_SET"]);

async function listed(): Promise<{ callable: boolean; refusal: string | null }> {
  const res = await discovery(new NextRequest("http://localhost/api/northbound/interfaces", { headers: { authorization: "Bearer ce_live_x" } }));
  const body = (await res.json()) as { data: { interfaces: { callable: boolean; refusal: string | null }[] } };
  return body.data.interfaces[0]!;
}

async function served(): Promise<{ status: number; reachedRead: boolean; bindingRefusal: unknown }> {
  mocks.read.mockClear();
  mocks.record.mockClear();
  const res = await dataRoute(
    new NextRequest("http://localhost/api/northbound/interfaces/if_1/data", { headers: { authorization: "Bearer ce_live_x" } }),
    { params: Promise.resolve({ id: "if_1" }) },
  );
  const audited = mocks.record.mock.calls.at(-1)?.[0] as { bindingRefusal?: unknown } | undefined;
  return { status: res.status, reachedRead: mocks.read.mock.calls.length > 0, bindingRefusal: audited?.bindingRefusal ?? null };
}

beforeEach(() => {
  mocks.authFailure = null;
  mocks.read.mockResolvedValue({ status: "OK", httpStatus: 200, records: [{ a: 1 }], detail: "1 record.", durationMs: 1, failureReason: null });
});

describe("discovery's callable is the data route's verdict", () => {
  const combos: [string, string, string, string, string | null, GrantShape, string, string, string | null][] = [];
  for (const status of ["ACTIVE", "DRAFT", "DEPRECATED"])
    for (const operation of ["READ", "CREATE"])
      for (const service of Object.keys(SERVICES))
        for (const entitySet of ["A_Set", null])
          for (const grant of GRANTS)
            for (const estate of Object.keys(ESTATES))
              for (const [environment, sapClient] of [["PROD", null], ["PROD", "100"], ["SANDBOX", null]] as const)
                combos.push([status, operation, service, entitySet ?? "(none)", entitySet, grant, estate, environment, sapClient]);

  it(`agrees on all ${combos.length} combinations`, async () => {
    const disagreements: string[] = [];
    const reasons: string[] = [];
    let callableCount = 0;
    for (const [status, operation, service, , entitySet, grant, estate, environment, sapClient] of combos) {
      const svc = SERVICES[service as keyof typeof SERVICES];
      const iface = {
        id: "if_1",
        name: "Feed",
        solutionId: "sol_1",
        ...svc,
        operation,
        mode: operation === "READ" ? "READ" : "WRITE",
        entitySet,
        version: 1,
        status,
        serviceVerifiedAt: null,
        serviceVerifications: null,
        createdAt: LONG_AGO,
        grantMatchChangedAt: null,
      };
      mocks.iface = iface;
      mocks.grants = grantFor(grant, iface);
      mocks.connections = ESTATES[estate]!(svc.sapProduct);
      mocks.client = {
        clientId: "cl_1",
        organizationId: "org_a",
        solutionId: "sol_1",
        environment,
        sapClient,
        scope: tenantScopeOf("org_a"),
      };

      const advertised = await listed();
      const actual = await served();
      const label = `${status}/${operation}/${service}/${entitySet ?? "no set"}/${grant}/${estate}/${environment}:${sapClient ?? "-"}`;

      if (advertised.callable !== actual.reachedRead) {
        disagreements.push(`${label}: callable ${advertised.callable}, data route ${actual.status}`);
        continue;
      }
      if (advertised.callable) {
        callableCount += 1;
        if (advertised.refusal !== null) reasons.push(`${label}: callable with a refusal`);
        continue;
      }
      const r = advertised.refusal ?? "";
      const agrees = ACCESS_REASONS.has(r)
        ? actual.status === 403 && actual.bindingRefusal === null
        : DEFINITION_REASONS.has(r)
          ? actual.status === 400
          : actual.status === 403 && actual.bindingRefusal === r;
      if (!agrees) reasons.push(`${label}: refusal ${r}, data route ${actual.status} (${String(actual.bindingRefusal)})`);
    }
    expect(disagreements.slice(0, 20), `${disagreements.length} callable disagreements`).toEqual([]);
    expect(reasons.slice(0, 20), `${reasons.length} refusal-reason disagreements`).toEqual([]);
    // The matrix exercises both verdicts, not one.
    expect(callableCount).toBeGreaterThan(20);
    expect(callableCount).toBeLessThan(combos.length / 2);
  }, 120_000);

  it("names the A42 cases: no entity set, in DRAFT and ACTIVE, is not callable and 400s", async () => {
    for (const status of ["DRAFT", "ACTIVE"]) {
      const iface = {
        id: "if_1", name: "Feed", solutionId: "sol_1", ...SERVICES.catalogue, operation: "READ", mode: "READ",
        entitySet: null, version: 1, status, createdAt: LONG_AGO, grantMatchChangedAt: null,
      };
      mocks.iface = iface;
      mocks.grants = grantFor("approved, bound", iface);
      mocks.connections = ESTATES["one undeclared"]!("s4hana");
      mocks.client = { clientId: "cl_1", organizationId: "org_a", solutionId: "sol_1", environment: "PROD", sapClient: null, scope: tenantScopeOf("org_a") };
      expect(await listed()).toEqual(expect.objectContaining({ callable: false, refusal: "NO_ENTITY_SET" }));
      expect((await served()).status).toBe(400);
    }
  });
});

describe("the credential's own state is refused alike (P0.11)", () => {
  it.each(["UNKNOWN_TOKEN", "EXPIRED", "ROTATED_OUT", "REVOKED", "INACTIVE", "SOLUTION_RETIRED"])(
    "%s → 401 from discovery and from the data route",
    async (reason) => {
      mocks.authFailure = reason;
      const list = await discovery(new NextRequest("http://localhost/api/northbound/interfaces", { headers: { authorization: "Bearer ce_live_x" } }));
      expect(list.status).toBe(401);
      expect((await served()).status).toBe(401);
    },
  );
});

describe("grantFetchedFor mirrors grantsForInterfaceWhere", () => {
  const iface = { id: "if_1", externalId: "API_X", operation: "READ", sapProduct: "s4hana", createdAt: LONG_AGO, grantMatchChangedAt: null };
  /** grantsForInterfaceWhere evaluated as the database would. */
  function matchesWhere(g: { externalId: string; operation: string; interfaceId: string | null; sapProduct: string | null }) {
    const where = grantsForInterfaceWhere(iface) as {
      externalId: string;
      operation: string;
      OR: ({ interfaceId: string; sapProduct: string } | { interfaceId: null })[];
    };
    return (
      g.externalId === where.externalId &&
      g.operation === where.operation &&
      where.OR.some((o) => (o.interfaceId === null ? g.interfaceId === null : g.interfaceId === o.interfaceId && g.sapProduct === (o as { sapProduct: string }).sapProduct))
    );
  }
  it("on every grant shape", () => {
    for (const externalId of ["API_X", "API_Y"])
      for (const operation of ["READ", "CREATE"])
        for (const interfaceId of [null, "if_1", "if_2"])
          for (const sapProduct of [null, "s4hana", "s4hana-onprem"]) {
            const g = { externalId, operation, interfaceId, sapProduct };
            expect(grantFetchedFor(g, iface), JSON.stringify(g)).toBe(matchesWhere(g));
          }
  });
});
