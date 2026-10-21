// @vitest-environment node
/**
 * The Contract Compiler, through the routes that use it (P1.3):
 *
 *   verify-service   compiles the description it just read and records the
 *                    contract — 1.0.0 the first time, nothing the second —
 *                    and writes a write interface's requestSchema; a
 *                    description the compiler refuses still verifies, and a
 *                    failed verify records nothing;
 *   /schema          serves the compiled contract and the request schema,
 *                    additively, and only while they describe the interface;
 *   capture-schema   records the sampled fallback;
 *   scaffold         builds openapi.json and openapi-3.0.json from the contract;
 *   solutions/…/openapi  the per-solution document, in both versions, valid.
 *
 * The database is an in-memory stand-in that honours organizationId, so a
 * route that forgot it would find nothing.
 */

import { readFileSync } from "fs";
import path from "path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Resolver from "@/lib/sap-public/connection-resolver";
import type * as RateLimit from "@/lib/security/rate-limit";

import { contractSentence } from "@/components/studio/ServiceVerifyPanel";

import { validateOpenApi30, validateOpenApi31 } from "../../helpers/openapi-validate";

type Row = Record<string, unknown>;

const { db, mocks } = vi.hoisted(() => ({
  db: {
    interfaces: [] as Row[],
    snapshots: [] as Row[],
    solutions: [] as Row[],
    grants: [] as Row[],
    failSnapshotCreate: false,
  },
  mocks: { user: vi.fn(), binding: vi.fn(), authHeaders: vi.fn(), audit: vi.fn(), record: vi.fn(), hub: vi.fn() },
}));

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const cond = v as Row;
      if ("in" in cond) return (cond.in as unknown[]).includes(row[k]);
      if ("not" in cond) return row[k] !== cond.not;
      if ("equals" in cond) return true;
      return false;
    }
    return row[k] === v;
  });
}

function pick(row: Row, select: Row | undefined): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [k, v] of Object.entries(select)) {
    if (k === "solution" && v) out.solution = db.solutions.find((s) => s.id === row.solutionId) ?? null;
    else if (v) out[k] = row[k] ?? null;
  }
  return out;
}

function ordered(rows: Row[], orderBy: unknown): Row[] {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Row[];
  return [...rows].sort((a, b) => {
    for (const o of keys) {
      const [k, dir] = Object.entries(o)[0] as [string, string];
      const x = a[k] as number | string;
      const y = b[k] as number | string;
      if (x !== y) return (x < y ? -1 : 1) * (dir === "desc" ? -1 : 1);
    }
    return 0;
  });
}

vi.mock("@/lib/db/prisma", () => {
  const table = (name: "interfaces" | "snapshots" | "solutions" | "grants") => ({
    findFirst: async ({ where, select, orderBy }: { where?: Row; select?: Row; orderBy?: unknown }) => {
      const hit = ordered(db[name].filter((r) => matches(r, where)), orderBy)[0];
      return hit ? pick(hit, select) : null;
    },
    findMany: async ({ where, select, orderBy }: { where?: Row; select?: Row; orderBy?: unknown }) =>
      ordered(db[name].filter((r) => matches(r, where)), orderBy).map((r) => pick(r, select)),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hits = db[name].filter((r) => matches(r, where));
      for (const r of hits) Object.assign(r, data);
      return { count: hits.length };
    },
    create: async ({ data, select }: { data: Row; select?: Row }) => {
      if (name === "snapshots" && db.failSnapshotCreate) throw new Error("database is down");
      const row = { id: `${name}_${db[name].length + 1}`, createdAt: new Date("2026-10-20T00:00:00.000Z"), ...data };
      db[name].push(row);
      return pick(row, select);
    },
  });
  return {
    prisma: {
      interface: table("interfaces"),
      contractSnapshot: table("snapshots"),
      solution: table("solutions"),
      apiAccessGrant: table("grants"),
      mockFixture: { findMany: async () => [] },
      configAudit: { create: mocks.audit },
    },
  };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: mocks.record }));
vi.mock("@/lib/sap-public/console-read-guard", () => ({ recordConsoleRead: mocks.record }));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof Resolver>()),
  resolveSapConnectionForEnvironment: mocks.binding,
  buildAuthHeadersFromConnection: mocks.authHeaders,
}));
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({
  resolveHubService: mocks.hub,
}));
vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: async () => ({
    ok: true,
    client: { clientId: "client_1", organizationId: "org_a", solutionId: "sol_1", scope: { organizationId: "org_a" }, environment: "DEV" },
  }),
  extractBearer: (s: string | null) => s,
  touchClientLastUsed: vi.fn(),
}));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimit>()),
  checkRateLimit: async () => ({ allowed: true, remaining: 10, resetMs: 1000 }),
}));

import { GET as getSchema } from "@/app/api/northbound/interfaces/[id]/schema/route";
import { POST as captureSchema } from "@/app/api/studio/interfaces/[id]/capture-schema/route";
import { GET as getScaffold } from "@/app/api/studio/interfaces/[id]/scaffold/route";
import { POST as verifyService } from "@/app/api/studio/interfaces/[id]/verify-service/route";
import { GET as getSolutionOpenApi } from "@/app/api/studio/solutions/[id]/openapi/route";

const RAP = readFileSync(path.resolve(__dirname, "../../fixtures/contracts/edmx/sales-order-rap.v4.xml"), "utf8");
const BUILDER = { id: "u_builder", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" };
const CONNECTION = {
  source: "db",
  id: "conn_dev",
  organizationId: "org_a",
  product: "s4hana",
  key: "dev",
  label: "S/4 DEV",
  baseUrl: "https://my-dev.s4hana.example",
  authType: "basic",
  secrets: { username: "u", password: "p" },
  oauthTokenUrl: null,
  writeEnabled: true,
  apiPath: null,
  timeoutMs: null,
  environment: "DEV",
  client: null,
};

function seed(over: Row = {}) {
  db.interfaces = [
    {
      id: "if_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      name: "Sales orders",
      version: 2,
      sapProduct: "s4hana",
      externalId: "CE_SALESORDER_0001",
      operation: "CREATE",
      mode: "WRITE",
      entitySet: "SalesOrder",
      servicePath: null,
      odataVersion: null,
      status: "DRAFT",
      serviceVerifications: null,
      requestSchema: null,
      responseSchema: null,
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      ...over,
    },
  ];
}

const xml = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "application/xml" } });

function verify() {
  return verifyService(
    new NextRequest("http://localhost/api/studio/interfaces/if_1/verify-service", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ environment: "DEV" }),
    }),
    { params: Promise.resolve({ id: "if_1" }) },
  );
}

async function data<T = Row>(res: Response): Promise<T> {
  return ((await res.json()) as { data: T }).data;
}

beforeEach(() => {
  db.snapshots = [];
  db.solutions = [{ id: "sol_1", organizationId: "org_a", name: "Order portal" }];
  db.grants = [];
  db.failSnapshotCreate = false;
  seed();
  mocks.user.mockResolvedValue(BUILDER);
  mocks.binding.mockResolvedValue({ ok: true, connection: CONNECTION, bindingUnverified: false });
  mocks.authHeaders.mockResolvedValue({ Authorization: "Basic dTpw" });
  mocks.audit.mockResolvedValue({ id: "a1" });
  mocks.hub.mockResolvedValue({ path: "/sap/opu/odata4/sap/api_salesorder/srvd_a2x/sap/salesorder/0001" });
  vi.stubGlobal("fetch", vi.fn(async () => xml(RAP)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("verify-service compiles and records the contract", () => {
  it("the first verify records 1.0.0 and writes the write interface's request schema", async () => {
    const d = await data<{ status: string; verified: boolean; entitySets: string[]; contract: Row }>(await verify());
    expect(d).toMatchObject({ status: "OK", verified: true, entitySets: ["SalesOrder", "SalesOrderItem", "Customer"] });
    expect(d.contract).toMatchObject({ status: "RECORDED", semver: "1.0.0", bump: "initial", requestSchemaWritten: true });
    expect(db.snapshots).toHaveLength(1);
    expect(db.snapshots[0]).toMatchObject({
      organizationId: "org_a",
      interfaceId: "if_1",
      interfaceVersion: 2,
      externalId: "CE_SALESORDER_0001",
      entitySet: "SalesOrder",
      source: "METADATA",
      odataVersion: "V4",
      environment: "DEV",
      connectionId: "conn_dev",
      createdById: "u_builder",
    });
    const rs = db.interfaces[0]!.requestSchema as Row;
    expect(rs.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(rs.required).toEqual(["SoldToParty", "PurchaseOrderByCustomer"]);
    expect(rs["x-contract"]).toMatchObject({ semver: "1.0.0", interfaceVersion: 2, entitySet: "SalesOrder", operation: "CREATE" });
    expect(mocks.audit.mock.calls.at(-1)![0].data.after.contract).toMatchObject({ status: "RECORDED", semver: "1.0.0" });
  });

  it("the same description again records nothing", async () => {
    await verify();
    const d = await data<{ contract: Row }>(await verify());
    expect(d.contract).toMatchObject({ status: "UNCHANGED", semver: "1.0.0" });
    expect(db.snapshots).toHaveLength(1);
  });

  it("a read interface's request schema is left alone", async () => {
    seed({ operation: "READ", mode: "READ" });
    const d = await data<{ contract: Row }>(await verify());
    expect(d.contract).toMatchObject({ status: "RECORDED", requestSchemaWritten: false });
    expect(db.interfaces[0]!.requestSchema).toBeNull();
  });

  it("a description the compiler refuses still verifies, as before", async () => {
    // A Schema in no namespace: well-formed XML, not CSDL. The older reader still lists it.
    const odd =
      '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
      '<Schema Namespace="ns"><EntityContainer Name="C"><EntitySet Name="SalesOrder" EntityType="ns.T"/></EntityContainer></Schema>' +
      "</edmx:DataServices></edmx:Edmx>";
    vi.stubGlobal("fetch", vi.fn(async () => xml(odd)));
    const d = await data<{ status: string; verified: boolean; entitySets: string[]; contract: Row }>(await verify());
    expect(d).toMatchObject({ status: "OK", verified: true, entitySets: ["SalesOrder"] });
    expect(d.contract).toMatchObject({ status: "NOT_COMPILED" });
    expect(db.snapshots).toHaveLength(0);
  });

  it("lists datasets from the compiled description, leaving out a singleton", async () => {
    const withSingleton = RAP.replace(
      '<EntitySet Name="Customer" EntityType="SAP__self.CustomerType"/>',
      '<EntitySet Name="Customer" EntityType="SAP__self.CustomerType"/><Singleton Name="Settings" Type="SAP__self.CustomerType"/>',
    );
    vi.stubGlobal("fetch", vi.fn(async () => xml(withSingleton)));
    const d = await data<{ entitySets: string[] }>(await verify());
    expect(d.entitySets).toEqual(["SalesOrder", "SalesOrderItem", "Customer"]);
  });

  it("a snapshot that cannot be written does not fail the verify", async () => {
    db.failSnapshotCreate = true;
    const d = await data<{ verified: boolean; contract: Row }>(await verify());
    expect(d.verified).toBe(true);
    expect(d.contract).toMatchObject({ status: "NOT_RECORDED" });
  });

  it("a verify that does not succeed compiles nothing into a contract", async () => {
    seed({ entitySet: "NoSuchSet" });
    const d = await data<{ status: string; contract: unknown }>(await verify());
    expect(d.status).toBe("ENTITY_SET_MISSING");
    expect(d.contract).toBeNull();
    expect(db.snapshots).toHaveLength(0);
  });
});

function schemaRoute() {
  return getSchema(
    new NextRequest("http://localhost/api/northbound/interfaces/if_1/schema", { headers: { authorization: "Bearer ce_x" } }),
    { params: Promise.resolve({ id: "if_1" }) },
  );
}

describe("/schema serves the compiled contract, additively", () => {
  it("before any compile: every field it had, and contract.source none", async () => {
    const d = await data(await schemaRoute());
    expect(d).toMatchObject({ requestSchema: null, responseSchema: null, schemaCaptured: false, schemaState: "none" });
    expect(d.contract).toMatchObject({ source: "none", semver: null, schemas: null });
  });

  it("after a verify: the compiled schemas, and the request schema of the write", async () => {
    await verify();
    const d = await data<{ requestSchema: Row; responseSchema: unknown; contract: { source: string; semver: string; schemas: Row } }>(await schemaRoute());
    expect(d.contract).toMatchObject({ source: "metadata", semver: "1.0.0", odataVersion: "V4" });
    expect(Object.keys(d.contract.schemas)).toEqual(["record", "create", "update", "key"]);
    expect((d.contract.schemas.record as Row)["x-odata-entity-set"]).toBe("SalesOrder");
    expect(d.requestSchema.required).toEqual(["SoldToParty", "PurchaseOrderByCustomer"]);
    // The captured schema keeps meaning what it meant: none was captured.
    expect(d.responseSchema).toBeNull();
  });

  it("a request schema of an earlier contract is not served", async () => {
    await verify();
    db.interfaces[0]!.version = 3; // a contract change the PATCH has not cleared
    const d = await data<{ requestSchema: unknown }>(await schemaRoute());
    expect(d.requestSchema).toBeNull();
  });

  it("a contract of another dataset is not current", async () => {
    await verify();
    db.interfaces[0]!.entitySet = "SalesOrderItem";
    const d = await data<{ contract: Row }>(await schemaRoute());
    expect(d.contract.source).toBe("none");
  });
});

describe("capture-schema records the sampled fallback", () => {
  function capture(rows: Row[]) {
    return captureSchema(
      new NextRequest("http://localhost/api/studio/interfaces/if_1/capture-schema", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows, interfaceVersion: 2 }),
      }),
      { params: Promise.resolve({ id: "if_1" }) },
    );
  }

  it("records it while no compiled contract exists", async () => {
    const d = await data<{ contract: Row }>(await capture([{ SalesOrder: "1", "@odata.etag": "W/1" }]));
    expect(d.contract).toMatchObject({ status: "RECORDED", semver: "1.0.0" });
    expect(db.snapshots[0]).toMatchObject({ source: "SAMPLED", odataVersion: "V4" });
  });

  it("never pushes a compiled one aside", async () => {
    await verify();
    const d = await data<{ contract: Row }>(await capture([{ SalesOrder: "1", "@odata.etag": "W/1" }]));
    expect(d.contract).toMatchObject({ status: "METADATA_PREFERRED", semver: "1.0.0" });
    expect(db.snapshots).toHaveLength(1);
  });

  it("records nothing when the rows' OData version cannot be told", async () => {
    mocks.hub.mockResolvedValue(null); // the catalogue no longer resolves the service
    const d = await data<{ contract: Row }>(await capture([{ SalesOrder: "1" }]));
    expect(d.contract).toMatchObject({ status: "NOT_RECORDED" });
    expect(db.snapshots).toHaveLength(0);
  });

  // What the Test Console really posts: rows broker-run served, with SAP's
  // envelope (`__metadata`, `@odata.*`) already stripped, for a catalogue
  // interface, which stores no OData version of its own.
  it("records a catalogue interface's broker-stripped rows under the version of the service it reads", async () => {
    expect(db.interfaces[0]).toMatchObject({ servicePath: null, odataVersion: null });
    const d = await data<{ contract: Row }>(await capture([{ SalesOrder: "1", SoldToParty: "C1" }]));
    expect(d.contract).toMatchObject({ status: "RECORDED", semver: "1.0.0" });
    expect(db.snapshots[0]).toMatchObject({ source: "SAMPLED", odataVersion: "V4" });
  });

  it("a catalogue service's declared protocol wins over its path", async () => {
    mocks.hub.mockResolvedValue({ path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER", protocol: "ODATAV2" });
    const d = await data<{ contract: Row }>(await capture([{ SalesOrder: "1" }]));
    expect(d.contract).toMatchObject({ status: "RECORDED" });
    expect(db.snapshots[0]).toMatchObject({ source: "SAMPLED", odataVersion: "V2" });
  });

  it("a service that cannot be resolved does not fail the capture", async () => {
    mocks.hub.mockRejectedValue(new Error("catalogue unavailable"));
    const res = await capture([{ SalesOrder: "1" }]);
    expect(res.status).toBe(200);
    expect((await data<{ contract: Row }>(res)).contract).toMatchObject({ status: "NOT_RECORDED" });
  });
});

describe("/schema and a sampled contract of an earlier contract", () => {
  it("does not serve the sampled snapshot while the capture it came from is withheld as stale", async () => {
    seed({ operation: "READ", mode: "READ" });
    const cap = await captureSchema(
      new NextRequest("http://localhost/api/studio/interfaces/if_1/capture-schema", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: [{ SalesOrder: "1", Secret: "x" }], interfaceVersion: 2 }),
      }),
      { params: Promise.resolve({ id: "if_1" }) },
    );
    expect(cap.status).toBe(200);
    expect(db.snapshots[0]).toMatchObject({ source: "SAMPLED" });
    // While current, the sampled contract is served beside the capture.
    const before = await data<{ schemaState: string; contract: { source: string } }>(await schemaRoute());
    expect(before).toMatchObject({ schemaState: "current", contract: { source: "sampled" } });

    // The operation changes on the same dataset: a new contract, v3.
    Object.assign(db.interfaces[0]!, { version: 3, operation: "CREATE", mode: "WRITE" });
    const d = await data<{ responseSchema: unknown; schemaState: string; contract: { source: string; schemas: unknown } }>(
      await schemaRoute(),
    );
    expect(d).toMatchObject({ responseSchema: null, schemaState: "stale" });
    expect(d.contract).toMatchObject({ source: "none", schemas: null, semver: null });
  });

  it("still serves a compiled snapshot after a change that leaves the dataset alone", async () => {
    await verify();
    db.interfaces[0]!.version = 3;
    const d = await data<{ contract: { source: string } }>(await schemaRoute());
    expect(d.contract.source).toBe("metadata");
  });
});

describe("the starter kit and the solution document use the compiled contract", () => {
  it("the kit's openapi.json and openapi-3.0.json describe the compiled write body", async () => {
    await verify();
    const res = await getScaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), {
      params: Promise.resolve({ id: "if_1" }),
    });
    const { files } = await data<{ files: { path: string; contents: string }[] }>(res);
    const v31 = JSON.parse(files.find((f) => f.path === "openapi.json")!.contents);
    const v30 = JSON.parse(files.find((f) => f.path === "openapi-3.0.json")!.contents);
    expect(v31.openapi).toBe("3.1.0");
    expect(v30.openapi).toBe("3.0.3");
    expect(validateOpenApi31(v31).errors).toEqual([]);
    expect(validateOpenApi30(v30).errors).toEqual([]);
    expect(Object.keys(v31.paths)).toEqual(["/interfaces/if_1/data/write", "/interfaces/if_1/schema"]);
    expect(v31.components.schemas.SalesOrder_Create.required).toEqual(["SoldToParty", "PurchaseOrderByCustomer"]);
    expect(v31["x-coreedge-interfaces"][0].contract).toMatchObject({ source: "metadata", semver: "1.0.0" });
    const client = files.find((f) => f.path === "client.ts")!.contents;
    expect(client).toContain("COMPILED from the service's own description");
    expect(client).toMatch(/SalesOrder: string;/);
  });

  it("the solution document, in 3.1 and 3.0.3, validates and covers every interface but a deprecated one", async () => {
    await verify();
    db.interfaces.push(
      { ...db.interfaces[0]!, id: "if_2", name: "Orders read", operation: "READ", mode: "READ", requestSchema: null },
      { ...db.interfaces[0]!, id: "if_3", name: "Old", operation: "READ", mode: "READ", status: "DEPRECATED" },
    );
    db.grants = [{ id: "g1", organizationId: "org_a", interfaceId: "if_2", operation: "READ", environment: "TEST", decision: "APPROVED", expiresAt: null, revokedAt: null }];
    for (const [q, version, validate] of [
      ["3.1", "3.1.0", validateOpenApi31],
      ["3.0", "3.0.3", validateOpenApi30],
    ] as const) {
      const res = await getSolutionOpenApi(new NextRequest(`http://localhost/api/studio/solutions/sol_1/openapi?version=${q}`), {
        params: Promise.resolve({ id: "sol_1" }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const doc = await res.json();
      expect(doc.openapi).toBe(version);
      expect(validate(doc).errors).toEqual([]);
      expect(Object.keys(doc.paths).sort()).toEqual([
        "/interfaces",
        "/interfaces/if_1/data/write",
        "/interfaces/if_1/schema",
        "/interfaces/if_2/data",
        "/interfaces/if_2/schema",
      ]);
      expect(doc.servers).toEqual([{ url: "http://localhost/api/northbound" }]);
      const if2 = doc["x-coreedge-interfaces"].find((i: Row) => i.id === "if_2");
      // A contract is recorded per interface: if_2 has not been verified itself.
      expect(if2.contract).toEqual({ source: "none" });
      const if1 = doc["x-coreedge-interfaces"].find((i: Row) => i.id === "if_1");
      expect(if1.contract).toMatchObject({ source: "metadata", semver: "1.0.0" });
      expect(if2.operations.list.grantedIn).toEqual(["TEST"]);
    }
  });

  it("refuses an unknown version, another organization's solution and a signed-out caller", async () => {
    const call = (url: string) => getSolutionOpenApi(new NextRequest(url), { params: Promise.resolve({ id: "sol_1" }) });
    expect((await call("http://localhost/api/studio/solutions/sol_1/openapi?version=2.0")).status).toBe(400);
    mocks.user.mockResolvedValue({ ...BUILDER, organizationId: "org_b" });
    expect((await call("http://localhost/api/studio/solutions/sol_1/openapi")).status).toBe(404);
    mocks.user.mockResolvedValue(null);
    expect((await call("http://localhost/api/studio/solutions/sol_1/openapi")).status).toBe(401);
  });
});

describe("the Verify panel's sentence about the contract", () => {
  it("says what was recorded, in plain words", () => {
    expect(contractSentence(null)).toBeNull();
    expect(contractSentence({ status: "RECORDED", semver: "1.0.0", bump: "initial" })).toBe(
      "Contract compiled from this description: version 1.0.0.",
    );
    expect(contractSentence({ status: "RECORDED", semver: "2.0.0", bump: "major" })).toBe(
      "Contract compiled from this description: version 2.0.0 (a major change).",
    );
    expect(contractSentence({ status: "UNCHANGED", semver: "1.1.0", bump: null })).toMatch(/unchanged: version 1\.1\.0/);
    expect(contractSentence({ status: "NOT_COMPILED", detail: "Could not be compiled." })).toBe("Could not be compiled.");
  });
});
