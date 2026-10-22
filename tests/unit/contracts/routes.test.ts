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
 *                    additively, and only while they describe the interface —
 *                    from the texts the record stored, never rendering, never
 *                    starting a worker or asking for compiler time;
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

import { longestStall } from "../../helpers/stall";

// Each verify, capture and download runs a real worker thread
// (lib/contracts/envelope.ts), which loads the compiler from source here:
// seconds per test on a loaded runner, not milliseconds.
vi.setConfig({ testTimeout: 60_000 });

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
    /** The organisation's compiler time today (contract-time.ts), in ms. */
    contractTimeMs: 0,
    /** Every raw statement sent, for the reads that must send none of some. */
    sql: [] as string[],
    /** Run once just before the next /schema texts read is answered: a record committing between /schema's two reads. */
    beforeSchemaTexts: null as null | (() => Promise<void>),
  },
  mocks: { user: vi.fn(), binding: vi.fn(), authHeaders: vi.fn(), audit: vi.fn(), record: vi.fn(), hub: vi.fn(), rate: vi.fn() },
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

vi.mock("@/lib/db/prisma", async () => {
  const { capturedSchemaFactRows, isSnapshotIrTextQuery, snapshotIrTextRows } = await import("../../helpers/captured-schema-facts");
  const {
    applyRawWrite,
    grantRows,
    isGrantsQuery,
    isSchemaTextsQuery,
    isSnapshotBodiesQuery,
    isSnapshotSummariesQuery,
    schemaTextsRows,
    snapshotBodiesRows,
    snapshotSummaryRows,
  } = await import("../../helpers/raw-sql-standin");
  const sqlOf = (q: unknown) => {
    const r = q as { sql?: string; strings?: readonly string[] } | null;
    return r?.sql ?? r?.strings?.join("") ?? "";
  };
  const table = (name: "interfaces" | "snapshots" | "solutions" | "grants") => ({
    findFirst: async ({ where, select, orderBy }: { where?: Row; select?: Row; orderBy?: unknown }) => {
      const hit = ordered(db[name].filter((r) => matches(r, where)), orderBy)[0];
      return hit ? pick(hit, select) : null;
    },
    findMany: async ({ where, select, orderBy, skip, take }: { where?: Row; select?: Row; orderBy?: unknown; skip?: number; take?: number }) =>
      ordered(db[name].filter((r) => matches(r, where)), orderBy)
        .slice(skip ?? 0, take === undefined ? undefined : (skip ?? 0) + take)
        .map((r) => pick(r, select)),
    deleteMany: async ({ where }: { where?: Row }) => {
      const before = db[name].length;
      db[name] = db[name].filter((r) => !matches(r, where));
      return { count: before - db[name].length };
    },
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
      // capturedSchemaFacts (response-schema-states.ts): the stamp and size of each stored schema.
      // And the IRs a read path hands to its render, as their stored text (snapshot.ts, snapshotIrTexts).
      // And what the contract paths ask in one statement each (raw-sql-standin.ts).
      $queryRaw: async (q: unknown) => {
        db.sql.push(sqlOf(q));
        const hook = isSchemaTextsQuery(q) ? db.beforeSchemaTexts : null;
        if (hook) {
          db.beforeSchemaTexts = null;
          await hook();
        }
        return sqlOf(q).includes('"ContractTime"')
          ? // A job's reservation (contract-time.ts) returns no row once the day is spent; a check reads the row.
            sqlOf(q).includes("RETURNING") && db.contractTimeMs >= contractSecondsPerOrgDay() * 1000
            ? []
            : [{ ms: db.contractTimeMs }]
          : isSnapshotSummariesQuery(q)
            ? snapshotSummaryRows(db.snapshots, q)
            : isSchemaTextsQuery(q)
              ? schemaTextsRows(db.snapshots, q)
              : isSnapshotBodiesQuery(q)
                ? snapshotBodiesRows(db.snapshots, q)
                : isGrantsQuery(q)
                  ? grantRows(db.grants, q)
                  : isSnapshotIrTextQuery(q)
                    ? snapshotIrTextRows(db.snapshots, q)
                    : capturedSchemaFactRows(db.interfaces, q);
      },
      // Every write sent as SQL (raw-sql-standin.ts), in the record's own transaction.
      $executeRaw: async (q: unknown) => {
        db.sql.push(sqlOf(q));
        return applyRawWrite({ snapshots: db.snapshots, interfaces: db.interfaces }, q);
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn((await import("@/lib/db/prisma")).prisma),
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
  checkRateLimit: (key: string, config: unknown) => mocks.rate(key, config) as unknown,
}));

import { GET as getSchema } from "@/app/api/northbound/interfaces/[id]/schema/route";
import { GET as getSchemaV1 } from "@/app/api/northbound/v1/interfaces/[id]/schema/route";
import { POST as captureSchema } from "@/app/api/studio/interfaces/[id]/capture-schema/route";
import { GET as getScaffold } from "@/app/api/studio/interfaces/[id]/scaffold/route";
import { POST as verifyService } from "@/app/api/studio/interfaces/[id]/verify-service/route";
import { GET as getSolutionOpenApi } from "@/app/api/studio/solutions/[id]/openapi/route";
import { kitLimit, LIMITS, maxDocumentInterfaces } from "@/lib/contracts/budget";
import { contractDigest } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import { contractSecondsPerOrgDay } from "@/lib/contracts/contract-time";
import { MAX_DOCUMENT_CONTRACT_BYTES } from "@/lib/contracts/doc-inputs";
import { envelopeIsolates } from "@/lib/contracts/envelope";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { NORTHBOUND_API_VERSIONS } from "@/lib/northbound/version-policy";

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
      requestSchemaStamp: null,
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
  db.contractTimeMs = 0;
  db.sql = [];
  db.beforeSchemaTexts = null;
  seed();
  mocks.user.mockResolvedValue(BUILDER);
  mocks.binding.mockResolvedValue({ ok: true, connection: CONNECTION, bindingUnverified: false });
  mocks.authHeaders.mockResolvedValue({ Authorization: "Basic dTpw" });
  mocks.audit.mockResolvedValue({ id: "a1" });
  mocks.hub.mockResolvedValue({ path: "/sap/opu/odata4/sap/api_salesorder/srvd_a2x/sap/salesorder/0001" });
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 10, resetMs: 1000 });
  vi.stubGlobal("fetch", vi.fn(async () => xml(RAP)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("verify-service compiles and records the contract", () => {
  it("the first verify records 1.0.0 and writes the stamp of the write interface's request schema", async () => {
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
    // Only the stamp is stored: the body is a multiple of the contract, and
    // GET …/schema renders it from the stamped snapshot (round 2).
    const rs = db.interfaces[0]!.requestSchemaStamp as Row;
    expect(Object.keys(rs)).toEqual(["x-contract"]);
    // Never in requestSchema, which a build before P1.3 serves raw (P1 on wave 2 integration review round 1).
    expect(db.interfaces[0]!.requestSchema).toBeNull();
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
    expect(db.interfaces[0]!.requestSchemaStamp).toBeNull();
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

/*
 * Consolidated review round 1: every /schema read selects and copies up to
 * 1 MiB of stored texts, and the only bucket was per credential, which an
 * organisation mints without bound. Its reads now also spend the
 * organisation's own bucket.
 */
describe("/schema is bounded per organisation, whatever its credential count", () => {
  it("spends the credential's bucket and the organisation's, and refuses 429 with Retry-After once the organisation's is spent", async () => {
    const keys: string[] = [];
    mocks.rate.mockImplementation(async (key: string) => {
      keys.push(key);
      return key.startsWith("northbound-schema:")
        ? { allowed: false, remaining: 0, resetMs: 30_000, reason: "limited" }
        : { allowed: true, remaining: 10, resetMs: 1000 };
    });
    const res = await schemaRoute();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(keys).toEqual(["northbound:client_1", "northbound-schema:org_a"]);
    expect(mocks.rate).toHaveBeenLastCalledWith("northbound-schema:org_a", RATE_LIMITS.northboundSchemaPerOrg);
    expect(RATE_LIMITS.northboundSchemaPerOrg).toEqual({ limit: 120, windowMs: 60_000 });
    // Audited as the throttle it is, before anything is read.
    expect(mocks.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: 429, externalId: "-schema-" }));
    expect(db.sql.some((q) => q.includes('"schemasText"'))).toBe(false);
  });

  /*
   * Consolidated review round 2: the organisation's refusal is not this
   * credential's. The developer guide says a RATE_LIMITED is about the
   * caller's own key, so this one says whose reads spent it, and is audited
   * with its own reason, which the per-credential throttle signals leave out.
   */
  it("the organisation's refusal says so and is audited ORG_SCHEMA_RATE; the credential's own is unchanged", async () => {
    mocks.rate.mockImplementation(async (key: string) =>
      key.startsWith("northbound-schema:") ? { allowed: false, remaining: 0, resetMs: 30_000, reason: "limited" } : { allowed: true, remaining: 10, resetMs: 1000 },
    );
    const byOrg = await schemaRoute();
    const orgError = ((await byOrg.json()) as { error: { code: string; message: string } }).error;
    expect(orgError.code).toBe("RATE_LIMITED");
    expect(orgError.message).toContain("Your organisation's credentials together have read /schema 120 times this minute");
    expect(mocks.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: 429, failureReason: "ORG_SCHEMA_RATE" }));

    mocks.rate.mockImplementation(async (key: string) =>
      key.startsWith("northbound:") ? { allowed: false, remaining: 0, resetMs: 30_000, reason: "limited" } : { allowed: true, remaining: 10, resetMs: 1000 },
    );
    const byKey = await schemaRoute();
    const keyError = ((await byKey.json()) as { error: { code: string; message: string } }).error;
    expect(keyError).toMatchObject({ code: "RATE_LIMITED", message: "Too many requests. Slow down and retry." });
    expect(mocks.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: 429, failureReason: null }));
  });
});

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

  it("a request schema written from a snapshot that is no longer current is not served beside the newer one", async () => {
    // Hostile-input review round 1: PROD verified UNCHANGED against its own
    // 1.0.0 after DEV recorded 2.0.0, and /schema served 1.0.0's closed body
    // beside 2.0.0's contract.
    await verify();
    db.snapshots.push({ ...db.snapshots[0]!, id: "snap_newer", semver: "2.0.0", semverMajor: 2, environment: "PROD" });
    const d = await data<{ requestSchema: unknown; contract: Row }>(await schemaRoute());
    expect(d.contract).toMatchObject({ source: "metadata", semver: "2.0.0", snapshotId: "snap_newer" });
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

describe("/schema on both base paths (P1.10)", () => {
  const call = (route: typeof getSchema, base: string, headers: Record<string, string> = {}) =>
    route(new NextRequest(`http://localhost${base}/interfaces/if_1/schema`, { headers: { authorization: "Bearer ce_x", ...headers } }), {
      params: Promise.resolve({ id: "if_1" }),
    });
  const body = async (res: Response) => {
    const json = (await res.json()) as { data: Row };
    return json.data;
  };

  it("the v1 alias serves the same compiled snapshot, and both name the version that served them", async () => {
    await verify();
    const original = await call(getSchema, "/api/northbound");
    const v1 = await call(getSchemaV1, "/api/northbound/v1");
    expect(original.status).toBe(200);
    expect(v1.status).toBe(200);
    const [a, b] = [await body(original), await body(v1)];
    expect(b).toEqual(a);
    expect((b.contract as Row).source).toBe("metadata");
    expect((b.contract as Row).snapshotId).toBe(db.snapshots[0]!.id);
    for (const res of [original, v1]) expect(res.headers.get("CoreEdge-Version")).toBe(NORTHBOUND_API_VERSIONS[0]!.version);
  });

  it("a pinned version is served the same contract; an unknown one is refused before the snapshot is read", async () => {
    await verify();
    const pinned = await call(getSchemaV1, "/api/northbound/v1", { "CoreEdge-Version": NORTHBOUND_API_VERSIONS[0]!.version });
    expect((await body(pinned)).contract).toMatchObject({ source: "metadata", semver: "1.0.0" });
    const refused = await call(getSchemaV1, "/api/northbound/v1", { "CoreEdge-Version": "1999-01" });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: Row }).error).toMatchObject({ code: "UNSUPPORTED_VERSION", requestedVersion: "1999-01" });
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

  /*
   * Consolidated review round 2: a sampled contract's texts come back only
   * from a capture (or a verify whose description compiles and records), so
   * its NOT_RENDERED note says so instead of "verify the service again".
   */
  it("a sampled contract that is NOT_RENDERED says to capture again", async () => {
    seed({ operation: "READ", mode: "READ" });
    const cap = await captureSchema(
      new NextRequest("http://localhost/api/studio/interfaces/if_1/capture-schema", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: [{ SalesOrder: "1" }], interfaceVersion: 2 }),
      }),
      { params: Promise.resolve({ id: "if_1" }) },
    );
    expect(cap.status).toBe(200);
    Object.assign(db.snapshots[0]!, { schemasText: null, createBodyText: null, updateBodyText: null });
    const d = await data<{ contract: Row }>(await schemaRoute());
    expect(d.contract).toMatchObject({ source: "sampled", schemas: null, schemasOmitted: "NOT_RENDERED" });
    expect(d.contract.schemasNote).toMatch(/Capture the schema again in the Test Console/);
    expect(d.contract.schemasNote).not.toMatch(/Verify the service again to render them/);
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
    expect(Object.keys(v31.paths)).toEqual(["/interfaces/if_1/data/write", "/interfaces/if_1/schema", "/versions"]);
    // The kit calls the path every deployment serves, the one an Instant
    // Rollback returns to included; its documents list v1 second (P1 wave A review).
    expect(files.find((f) => f.path === ".env.example")!.contents).toContain("COREEDGE_BASE_URL=http://localhost/api/northbound\n");
    for (const doc of [v31, v30]) {
      expect(doc.servers.map((s: Row) => s.url)).toEqual(["http://localhost/api/northbound", "http://localhost/api/northbound/v1"]);
    }
    expect(v31.components.schemas.SalesOrder_Create.required).toEqual(["SoldToParty", "PurchaseOrderByCustomer"]);
    expect(v31["x-coreedge-interfaces"][0].contract).toMatchObject({ source: "metadata", semver: "1.0.0" });
    const client = files.find((f) => f.path === "client.ts")!.contents;
    expect(client).toContain("COMPILED from the service's own description");
    expect(client).toMatch(/SalesOrder: string;/);
  });

  it("the solution document, in 3.1 and 3.0.3, validates and covers every interface but a deprecated one", async () => {
    await verify();
    db.interfaces.push(
      { ...db.interfaces[0]!, id: "if_2", name: "Orders read", operation: "READ", mode: "READ", requestSchemaStamp: null },
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
        "/versions",
      ]);
      expect(doc.servers.map((s: Row) => s.url)).toEqual(["http://localhost/api/northbound", "http://localhost/api/northbound/v1"]);
      const if2 = doc["x-coreedge-interfaces"].find((i: Row) => i.id === "if_2");
      // A contract is recorded per interface: if_2 has not been verified itself.
      expect(if2.contract).toEqual({ source: "none" });
      const if1 = doc["x-coreedge-interfaces"].find((i: Row) => i.id === "if_1");
      expect(if1.contract).toMatchObject({ source: "metadata", semver: "1.0.0" });
      expect(if2.operations.list.grantedIn).toEqual(["TEST"]);
    }
  });

  /*
   * Hostile-input review round 1: sixteen maximum-size contracts made the
   * solution document throw RangeError (an uncaught 500) after 1.2 GB of
   * RSS. A document past MAX_DOCUMENT_CONTRACT_BYTES is refused from the
   * sizes kept at record time — before any IR is read, which a row whose
   * IR throws when read proves.
   */
  it("refuses a kit and a solution document past the render budget, before reading any IR", async () => {
    await verify();
    expect(db.snapshots[0]!.irBytes).toBeGreaterThan(0); // kept at record time
    db.interfaces.push({ ...db.interfaces[0]!, id: "if_2", name: "Orders read", operation: "READ", mode: "READ", requestSchemaStamp: null });
    // Each under the budget alone, past it together.
    const share = Math.ceil(MAX_DOCUMENT_CONTRACT_BYTES * 0.6);
    db.snapshots.push({ ...db.snapshots[0]!, id: "snap_2", interfaceId: "if_2" });
    for (const s of db.snapshots) {
      s.irBytes = share;
      Object.defineProperty(s, "ir", {
        get() {
          throw new Error("an IR was read");
        },
      });
    }
    const solution = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), {
      params: Promise.resolve({ id: "sol_1" }),
    });
    expect(solution.status).toBe(422);
    expect(((await solution.json()) as { error: Row }).error).toMatchObject({ code: "TOO_LARGE" });

    for (const s of db.snapshots) s.irBytes = MAX_DOCUMENT_CONTRACT_BYTES + 1;
    const kit = await getScaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), {
      params: Promise.resolve({ id: "if_1" }),
    });
    expect(kit.status).toBe(422);
    expect(((await kit.json()) as { error: Row }).error).toMatchObject({ code: "TOO_LARGE" });
  });

  /*
   * Hostile-input review round 2: /schema re-rendered any stored contract on
   * every call, with no budget — 35 MB and 2.8 s of CPU for one the kit and
   * the solution document refused as TOO_LARGE.
   */
  it("/schema names a contract past the documents' budget without reading its IR or rendering it", async () => {
    await verify();
    const snap = db.snapshots[0]!;
    snap.irBytes = MAX_DOCUMENT_CONTRACT_BYTES + 1;
    Object.defineProperty(snap, "ir", {
      get() {
        throw new Error("an IR was read");
      },
    });
    const d = await data<{ requestSchema: unknown; contract: Row }>(await schemaRoute());
    expect(d.contract).toMatchObject({ source: "metadata", semver: "1.0.0", snapshotId: snap.id, schemas: null, schemasOmitted: "TOO_LARGE" });
    expect(d.requestSchema).toBeNull();
  });

  /*
   * P1.3 structural containment: every read path renders under ITS OWN
   * budget — a function of the size kept at record time (budget.ts) — and
   * stops there. The record measured the same contract under the same budget
   * in the envelope, so a row's kept size never understates it; here one is
   * made to (an IR grown after its size was kept), and each read path refuses
   * rather than renders past what was stored.
   */
  describe("each read path renders under the budget of what was stored, and stops there", () => {
    const grow = async () => {
      await verify();
      const snap = db.snapshots[0]!;
      const ir = snap.ir as { entityType: { properties: Row[] } };
      for (let i = 0; i < 20_000; i++) ir.entityType.properties.push({ name: `ZZ1_EXT_${i}`, type: "Edm.String", nullable: true, label: `Extension field ${i}` });
      snap.irBytes = 1;
      return snap;
    };

    it("/schema: the texts the record rendered, whatever the IR became — it renders nothing", async () => {
      const snap = await grow();
      const d = await data<{ requestSchema: Row | null; contract: { snapshotId: string; schemas: { record: { properties: Row } } } }>(await schemaRoute());
      expect(d.contract.snapshotId).toBe(snap.id);
      expect(Object.keys(d.contract.schemas.record.properties)).not.toContain("ZZ1_EXT_0");
      expect(d.requestSchema).not.toBeNull();
    });

    it("the starter kit: TOO_LARGE", async () => {
      await grow();
      const kit = await getScaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), { params: Promise.resolve({ id: "if_1" }) });
      expect(kit.status).toBe(422);
      expect(((await kit.json()) as { error: Row }).error).toMatchObject({ code: "TOO_LARGE" });
    });

    it("the solution document: TOO_LARGE", async () => {
      await grow();
      const solution = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), {
        params: Promise.resolve({ id: "sol_1" }),
      });
      expect(solution.status).toBe(422);
      expect(((await solution.json()) as { error: Row }).error).toMatchObject({ code: "TOO_LARGE" });
    });

    it("and each serves the same contract when its kept size is its own", async () => {
      await verify();
      const schema = await data<{ contract: Row }>(await schemaRoute());
      expect(schema.contract.schemas).not.toBeNull();
      const kit = await getScaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), { params: Promise.resolve({ id: "if_1" }) });
      expect(kit.status).toBe(200);
      const solution = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), {
        params: Promise.resolve({ id: "sol_1" }),
      });
      expect(solution.status).toBe(200);
    });
  });

  it("the solution document's info.version follows its interfaces' contracts: a major bump raises its major", async () => {
    const version = async () => {
      const res = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), {
        params: Promise.resolve({ id: "sol_1" }),
      });
      return ((await res.json()) as { info: { version: string } }).info.version;
    };
    await verify();
    const before = await version();
    expect(before).toMatch(/^1\.0\.0\+[0-9a-f]{12}$/);
    db.snapshots.push({ ...db.snapshots[0]!, id: "snap_major", semver: "2.0.0", semverMajor: 2 });
    expect(await version()).toMatch(/^2\.0\.0\+[0-9a-f]{12}$/);
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

/*
 * STRUCTURAL HARDENING, ROUND 1. A hostile SAP returns one row of hundreds of
 * thousands of distinct keys; the builder captures its schema. Before: an
 * 11.5 MB schema was inferred and stored on this thread, the sampled contract
 * made from it was copied into the envelope only to be refused, /schema served
 * the 11.5 MB on every call outside its 64 KB budget, and the solution document
 * loaded every interface's stored schema and built the whole document before
 * its budget was asked. Each step is now bounded by a stated limit.
 */
describe("a captured schema is bounded where it is written and where it is read", () => {
  /** A captured schema of `n` fields, stamped for interface version 2 on SalesOrder (the seeded interface). */
  function storedCapture(n: number, nameLength = 8): Row {
    const properties: Row = {};
    for (let i = 0; i < n; i++) properties[`F${String(i).padStart(nameLength - 1, "0")}`] = { type: "string" };
    return {
      type: "object",
      properties,
      required: [],
      additionalProperties: true,
      "x-captured": { sampleSize: 1, capturedAt: "2026-10-01T00:00:00.000Z", note: "", envelope: "stripped", interfaceVersion: 2, entitySet: "SalesOrder" },
    };
  }

  function capture(body: string) {
    return captureSchema(
      new NextRequest("http://localhost/api/studio/interfaces/if_1/capture-schema", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      { params: Promise.resolve({ id: "if_1" }) },
    );
  }

  it("capture-schema refuses rows past the field bound (TOO_LARGE) before inferring, storing or recording anything", async () => {
    const row: Row = {};
    for (let i = 0; i < LIMITS.capturedSchema.properties + 1; i++) row[`k${i}`] = 0;
    const res = await capture(JSON.stringify({ rows: [row], interfaceVersion: 2 }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: Row }).error).toMatchObject({ code: "TOO_LARGE" });
    expect(db.interfaces[0]!.responseSchema).toBeNull();
    expect(db.snapshots).toHaveLength(0);
  });

  it("capture-schema refuses a body past its stated size before parsing it", async () => {
    const big = JSON.stringify({ rows: [{ a: "x".repeat(LIMITS.capturedSchema.requestBytes) }], interfaceVersion: 2 });
    const res = await capture(big);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: Row }).error).toMatchObject({ code: "TOO_LARGE" });
    expect(db.interfaces[0]!.responseSchema).toBeNull();
  });

  /*
   * Structural hardening, round 2: one long value (an attachment's base64)
   * makes a body past its size while describing one field, and the builder was
   * told the rows describe more than 2,000 fields and to narrow the dataset —
   * neither true nor any help. The body's own refusal says what it is.
   */
  it("capture-schema says a body past its size is too many bytes of rows, not too many fields", async () => {
    const big = JSON.stringify({ rows: [{ a: "x".repeat(LIMITS.capturedSchema.requestBytes) }], interfaceVersion: 2 });
    const { error } = (await (await capture(big)).json()) as { error: { code: string; message: string } };
    expect(error.code).toBe("TOO_LARGE");
    expect(error.message).toMatch(/larger than 4\.5 MB together/);
    expect(error.message).toMatch(/fewer rows/);
    expect(error.message).not.toMatch(/2,000 fields/);
    // Rows past the field bound keep their own answer.
    const row: Row = {};
    for (let i = 0; i < LIMITS.capturedSchema.properties + 1; i++) row[`k${i}`] = 0;
    const wide = (await (await capture(JSON.stringify({ rows: [row], interfaceVersion: 2 }))).json()) as { error: { message: string } };
    expect(wide.error.message).toMatch(/2,000 fields/);
  });

  it("capture-schema still captures an ordinary wide row", async () => {
    const row: Row = {};
    for (let i = 0; i < 300; i++) row[`Field${i}`] = "v";
    const res = await capture(JSON.stringify({ rows: [row], interfaceVersion: 2 }));
    expect(res.status).toBe(200);
    expect(await data<{ fields: number }>(res)).toMatchObject({ fields: 300 });
  });

  it("/schema does not return a stored 11 MB captured schema whole, nor read it", async () => {
    const huge = storedCapture(358_000);
    db.interfaces[0]!.responseSchema = huge;
    const findMany = vi.spyOn((await import("@/lib/db/prisma")).prisma.interface, "findMany");
    const res = await schemaRoute();
    const text = await res.text();
    expect(text.length).toBeLessThan(LIMITS.schema.floor + LIMITS.capturedSchema.served);
    const d = (JSON.parse(text) as { data: Row }).data;
    expect(d).toMatchObject({ responseSchema: null, responseSchemaOmitted: "TOO_LARGE", schemaCaptured: true, schemaState: "current" });
    // Its stored size was enough to refuse it: the schema itself was never selected.
    expect(findMany).not.toHaveBeenCalled();
  });

  it("/schema charges a captured schema it does read to the answer's budget", async () => {
    // Inside the stored-size bound, past what a served schema may be.
    db.interfaces[0]!.responseSchema = storedCapture(20_000, 16);
    const d = await data<Row>(await schemaRoute());
    expect(d).toMatchObject({ responseSchema: null, responseSchemaOmitted: "TOO_LARGE" });
    db.interfaces[0]!.responseSchema = storedCapture(50);
    const ok = await data<Row>(await schemaRoute());
    expect(ok.responseSchemaOmitted).toBeUndefined();
    expect(Object.keys((ok.responseSchema as { properties: Row }).properties)).toHaveLength(50);
  });

  it("the starter kit leaves out a captured schema past its bound, and says so", async () => {
    db.interfaces[0]!.responseSchema = storedCapture(358_000);
    const kit = await getScaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), { params: Promise.resolve({ id: "if_1" }) });
    expect(kit.status).toBe(200);
    const files = (await data<{ files: { path: string; contents: string }[] }>(kit)).files;
    expect(files.find((f) => f.path === "client.ts")!.contents).toMatch(/larger than a captured schema may be/);
    expect(files.reduce((n, f) => n + f.contents.length, 0)).toBeLessThan(kitLimit(0));
  });

  /*
   * Structural hardening, round 5: the kit was budgeted by the current
   * snapshot's size even when it rendered the captured schema instead — a
   * SAMPLED snapshot of an earlier, narrow capture (its successor's sampled
   * contract never recorded: the envelope was busy) budgeted a kit of a wide
   * capture at a fraction of its size, and refused it TOO_LARGE with advice
   * that did not apply, while /schema and the solution document served it.
   */
  it("a kit is budgeted by what it renders: a stale narrow sampled snapshot beside a wide current capture", async () => {
    seed({ operation: "READ", mode: "READ" });
    // The earlier capture: five fields, recorded as the sampled contract 1.0.0.
    const narrow = await capture(JSON.stringify({ rows: [{ SalesOrder: "1", A: "a", B: "b", C: "c", D: "d" }], interfaceVersion: 2 }));
    expect(narrow.status).toBe(200);
    expect(db.snapshots).toHaveLength(1);
    expect(db.snapshots[0]).toMatchObject({ source: "SAMPLED" });
    const sampledBytes = db.snapshots[0]!.irBytes as number;
    // The later capture of the full rows, stored; its sampled contract never recorded.
    db.interfaces[0]!.responseSchema = storedCapture(2000, 72);
    expect(Buffer.byteLength(JSON.stringify(db.interfaces[0]!.responseSchema))).toBeLessThan(LIMITS.capturedSchema.bytes);

    const kit = await getScaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), { params: Promise.resolve({ id: "if_1" }) });
    expect(kit.status).toBe(200);
    const files = (await data<{ files: { path: string; contents: string }[] }>(kit)).files;
    // What made the old budget wrong: the kit is larger than the sampled snapshot's own budget allows.
    expect(files.reduce((n, f) => n + Buffer.byteLength(f.contents), 0)).toBeGreaterThan(kitLimit(sampledBytes));
    expect(files.find((f) => f.path === "client.ts")!.contents).toContain(`F${"1999".padStart(71, "0")}`);
    // And the read paths agree about the one stored capture.
    const schema = await schemaRoute();
    expect(schema.status).toBe(200);
    expect(Object.keys(((await data<Row>(schema)).responseSchema as { properties: Row }).properties)).toHaveLength(2000);
    const doc = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), { params: Promise.resolve({ id: "sol_1" }) });
    expect(doc.status).toBe(200);
  });

  it("the solution document is refused past the interfaces one document carries, before any schema is read", async () => {
    const base = db.interfaces[0]!;
    db.interfaces = Array.from({ length: maxDocumentInterfaces() + 1 }, (_, i) => ({
      ...base,
      id: `if_${i + 1}`,
      operation: "READ",
      mode: "READ",
      responseSchema: storedCapture(5),
    }));
    const queryRaw = vi.spyOn((await import("@/lib/db/prisma")).prisma, "$queryRaw");
    const res = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), {
      params: Promise.resolve({ id: "sol_1" }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string; message: string } }).error).toMatchObject({
      code: "TOO_LARGE",
      message: expect.stringContaining(`more than ${maxDocumentInterfaces()} interfaces`),
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("the solution document is refused when its captured schemas add up past its budget, before any is read", async () => {
    const base = db.interfaces[0]!;
    // Each a quarter of the document's contract budget: five of them pass it.
    const each = storedCapture(Math.ceil(MAX_DOCUMENT_CONTRACT_BYTES / 4 / 48), 32);
    expect(JSON.stringify(each).length).toBeGreaterThan(MAX_DOCUMENT_CONTRACT_BYTES / 4);
    db.interfaces = Array.from({ length: 5 }, (_, i) => ({ ...base, id: `if_${i + 1}`, operation: "READ", mode: "READ", responseSchema: each }));
    const findMany = vi.spyOn((await import("@/lib/db/prisma")).prisma.interface, "findMany");
    const res = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), {
      params: Promise.resolve({ id: "sol_1" }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: Row }).error).toMatchObject({ code: "TOO_LARGE" });
    // The interfaces were listed; no stored schema was selected.
    for (const call of findMany.mock.calls) expect(Object.keys((call[0] as { select: Row }).select)).not.toContain("responseSchema");
  });

  /*
   * Structural hardening, round 2: a capture stored before capture was
   * bounded, inside the stored-text bound (1 MiB) but past what a served
   * schema may be (520 KiB). /schema withheld it as TOO_LARGE; the kit and
   * the solution document, from the same row, described all 20,000 fields.
   * Whether it is served is now decided once (readCurrentCapturedSchemas),
   * and all three say the same.
   */
  it("/schema, the starter kit and the solution document agree about a captured schema past what may be served", async () => {
    const stored = storedCapture(20_000, 16);
    const compact = JSON.stringify(stored).length;
    expect(compact).toBeGreaterThan(LIMITS.capturedSchema.served);
    expect(compact).toBeLessThan(LIMITS.capturedSchema.storedTextBytes);
    db.interfaces[0] = { ...db.interfaces[0]!, operation: "READ", mode: "READ", responseSchema: stored };

    const schema = await data<Row>(await schemaRoute());
    expect(schema).toMatchObject({ responseSchema: null, responseSchemaOmitted: "TOO_LARGE", schemaCaptured: true });

    const kit = await getScaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), { params: Promise.resolve({ id: "if_1" }) });
    expect(kit.status).toBe(200);
    const files = (await data<{ files: { path: string; contents: string }[] }>(kit)).files;
    expect(files.find((f) => f.path === "client.ts")!.contents).toMatch(/larger than a captured schema may be/);
    for (const name of ["openapi.json", "openapi-3.0.json"]) {
      expect(files.find((f) => f.path === name)!.contents, name).not.toContain("F000000000019999");
    }

    const solution = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), {
      params: Promise.resolve({ id: "sol_1" }),
    });
    expect(solution.status).toBe(200);
    const text = await solution.text();
    expect(text).not.toContain("F000000000019999");
    const doc = JSON.parse(text) as { "x-coreedge-interfaces": { contract: { source: string } }[] };
    expect(doc["x-coreedge-interfaces"][0]!.contract.source).toBe("none");
    expect(text).toMatch(/larger than a captured schema may be/);

    // And one inside the bound is served by all three.
    db.interfaces[0]!.responseSchema = storedCapture(50);
    expect(Object.keys(((await data<Row>(await schemaRoute())).responseSchema as { properties: Row }).properties)).toHaveLength(50);
    const kitOk = (await data<{ files: { path: string; contents: string }[] }>(
      await getScaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), { params: Promise.resolve({ id: "if_1" }) }),
    )).files;
    expect(kitOk.find((f) => f.path === "openapi.json")!.contents).toContain("F0000049");
    const docOk = (await (
      await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), { params: Promise.resolve({ id: "sol_1" }) })
    ).json()) as { "x-coreedge-interfaces": { contract: { source: string } }[] };
    expect(docOk["x-coreedge-interfaces"][0]!.contract.source).toBe("sampled");
  });

  /*
   * Structural hardening, round 2: the interface count bound came from a
   * per-interface floor of 128 KiB, ten times what an interface renders, and
   * refused a solution of 255 interfaces whose document is about 3 MB. It is
   * now sized from what an interface renders, so such a solution is served —
   * built in the envelope, its budget being past what the request thread
   * renders — and the bound still refuses a solution far past it.
   */
  it("serves the solution document of a solution with more than 254 interfaces", async () => {
    const base = db.interfaces[0]!;
    db.interfaces = Array.from({ length: 300 }, (_, i) => ({
      ...base,
      id: `if_${i + 1}`,
      name: `Interface ${i + 1} ${"n".repeat(180)}`,
      externalId: `custom:/sap/opu/odata/sap/ZAPI_${i}_SRV`,
      operation: "READ",
      mode: "READ",
    }));
    const res = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), {
      params: Promise.resolve({ id: "sol_1" }),
    });
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { "x-coreedge-interfaces": unknown[] };
    expect(doc["x-coreedge-interfaces"]).toHaveLength(300);
    // The count bound is now about what an interface renders: a thousand of them.
    expect(maxDocumentInterfaces()).toBeGreaterThan(1000);
  }, 120_000);

  it("and serves a solution document of captured schemas inside its budget", async () => {
    const base = db.interfaces[0]!;
    db.interfaces = Array.from({ length: 3 }, (_, i) => ({ ...base, id: `if_${i + 1}`, operation: "READ", mode: "READ", responseSchema: storedCapture(40) }));
    const res = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), {
      params: Promise.resolve({ id: "sol_1" }),
    });
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { "x-coreedge-interfaces": { contract: { source: string } }[] };
    expect(doc["x-coreedge-interfaces"].map((i) => i.contract.source)).toEqual(["sampled", "sampled", "sampled"]);
  });
});

/*
 * GET /schema IS NEVER RENDERED (P1.3): it serves the texts the record
 * rendered once in the compiler's worker, spliced in as they are, and never
 * starts a worker, waits for the compiler's gate or asks for compiler time.
 * The Studio downloads render in a job of the downloading organisation's,
 * and say so when the compiler cannot take one.
 */
describe("the read paths and the compiler", () => {
  /** A wide contract, sliced and digested as the record would keep it: on the dataset the seeded interface reads. */
  function wideDescription(properties: number) {
    const props = Array.from({ length: properties }, (_, i) => `<Property Name="F${i}" Type="Edm.Decimal" Precision="9" Scale="2"/>`).join("");
    return (
      `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" ` +
      `xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata"><edmx:DataServices m:DataServiceVersion="2.0">` +
      `<Schema Namespace="S" xmlns="http://schemas.microsoft.com/ado/2008/09/edm"><EntityType Name="SalesOrderType"><Key><PropertyRef Name="F0"/></Key>${props}</EntityType>` +
      `<EntityContainer Name="C" m:IsDefaultEntityContainer="true"><EntitySet Name="SalesOrder" EntityType="S.SalesOrderType"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`
    );
  }

  it("/schema and /v1 of a contract with texts near their 1 MiB: served from the stored texts, no worker, no compiler time, the thread ticking", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => xml(wideDescription(800))));
    const verified = await data<{ contract: Row }>(await verify());
    expect(verified.contract).toMatchObject({ status: "RECORDED" });
    expect(db.snapshots[0]!.irBytes as number).toBeGreaterThan(40_000);
    expect((db.snapshots[0]!.schemasText as string).length).toBeGreaterThan(256 * 1024);
    envelopeIsolates();
    db.sql = [];
    const schema = await longestStall(() => schemaRoute());
    const d = await data<{ requestSchema: Row | null; contract: { schemas: { record: { properties: Row } } | null } }>(schema.value);
    expect(Object.keys(d.contract.schemas!.record.properties)).toHaveLength(800);
    expect(d.requestSchema).not.toBeNull();
    const v1 = await longestStall(() =>
      getSchemaV1(new NextRequest("http://localhost/api/northbound/v1/interfaces/if_1/schema", { headers: { authorization: "Bearer ce_x" } }), {
        params: Promise.resolve({ id: "if_1" }),
      }),
    );
    expect(await v1.value.text()).toBe(await schemaRoute().then((r) => r.text()));
    // No worker was started, no compiler time was asked for or charged, no IR was read.
    expect(envelopeIsolates()).toEqual({ live: 0, peak: 0 });
    expect(db.sql.some((q) => q.includes('"ContractTime"'))).toBe(false);
    expect(db.sql.some((q) => q.includes('"ir"'))).toBe(false);
    // A copy of stored text: well under a render's cost (a load-robust bound on this thread's own CPU).
    expect(schema.ms, "/schema").toBeLessThan(200);
    expect(v1.ms, "/v1 /schema").toBeLessThan(200);
  }, 180_000);

  it("a snapshot whose texts are gone (recorded before them, or no longer the row last verified) answers NOT_RENDERED", async () => {
    await verify();
    const snap = db.snapshots[0]!;
    const rendered = await schemaRoute().then((r) => r.text());
    Object.assign(snap, { schemasText: null, createBodyText: null, updateBodyText: null });
    const d = await data<{ requestSchema: unknown; contract: Row }>(await schemaRoute());
    expect(d.contract).toMatchObject({ source: "metadata", snapshotId: snap.id, schemas: null, schemasOmitted: "NOT_RENDERED" });
    expect(d.contract.schemasNote).toMatch(/Verify the service again/);
    expect(d.requestSchema).toBeNull();
    // A verify of the same contract re-attaches them, rendered from the row's own IR: the same bytes.
    expect((await data<{ contract: Row }>(await verify())).contract).toMatchObject({ status: "UNCHANGED" });
    expect(await schemaRoute().then((r) => r.text())).toBe(rendered);
  });

  /*
   * Consolidated containment review round 6: /schema reads the current row's
   * summary and its texts in two statements, and a record commits its new
   * row with the texts moved onto it in between. The route answered
   * NOT_RENDERED ("Verify the service again") for a contract that had texts.
   */
  it("a version recorded between /schema's summary and its texts is served, never NOT_RENDERED", async () => {
    await verify();
    expect(db.snapshots[0]).toMatchObject({ semver: "1.0.0" });
    const changed = RAP.replace(
      '<Property Name="SalesOrderType" Type="Edm.String" Nullable="false" MaxLength="4"/>',
      '<Property Name="SalesOrderType" Type="Edm.String" Nullable="false" MaxLength="4"/><Property Name="DeliveryNote" Type="Edm.String" MaxLength="40"/>',
    );
    expect(changed).not.toBe(RAP);
    vi.stubGlobal("fetch", vi.fn(async () => xml(changed)));
    // The summary has picked 1.0.0; the record of 1.1.0 commits before its texts are read.
    db.beforeSchemaTexts = async () => {
      expect((await data<{ contract: Row }>(await verify())).contract).toMatchObject({ status: "RECORDED", semver: "1.1.0" });
    };
    const d = await data<{ contract: Row & { schemas: { record: { properties: Row } } | null } }>(await schemaRoute());
    expect(db.beforeSchemaTexts).toBeNull();
    expect(db.snapshots[0]!.schemasText).toBeNull();
    expect(d.contract).toMatchObject({ source: "metadata", semver: "1.1.0", snapshotId: db.snapshots[1]!.id });
    expect(d.contract).not.toHaveProperty("schemasOmitted");
    expect(d.contract.schemas!.record.properties).toHaveProperty("DeliveryNote");
    // The same contract a read after the record gives. (Its requestSchema
    // follows the interface's stamp, read before the record moved it.)
    expect(JSON.stringify(d.contract)).toBe(JSON.stringify((await data<{ contract: Row }>(await schemaRoute())).contract));
  });

  it("with the organisation's compiler time spent: /schema still serves; the kit and the document are 429 until 00:00 UTC; the verify's contract says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await verify();
    vi.stubEnv("COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY", "40");
    db.contractTimeMs = 40_000;
    try {
      expect((await data<{ contract: Row }>(await schemaRoute())).contract.schemas).not.toBeNull();
      const kit = await getScaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), { params: Promise.resolve({ id: "if_1" }) });
      expect(kit.status).toBe(429);
      const retryAfter = Number(kit.headers.get("retry-after"));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(86_400);
      const kitError = ((await kit.json()) as { error: { code: string; message: string } }).error;
      expect(kitError.code).toBe("RATE_LIMITED");
      expect(kitError.message).toMatch(/^This starter kit could not be generated: your organisation has used its 40 s of contract compile time for today/);
      const doc = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), { params: Promise.resolve({ id: "sol_1" }) });
      expect(doc.status).toBe(429);
      // SAP is not asked for a description its compile could not use (consolidated review round 1).
      const sap = vi.fn(async () => xml(RAP));
      vi.stubGlobal("fetch", sap);
      const verified = await data<{ status: string; verified: boolean; entitySets: string[]; detail: string; contract: { status: string; detail: string; retryAfterSeconds?: number } }>(await verify());
      expect(sap).not.toHaveBeenCalled();
      expect(verified).toMatchObject({ status: "COMPILER_UNAVAILABLE", verified: false });
      expect(verified.detail).toMatch(/SAP was not asked: your organisation has used its 40 s of contract compile time/);
      expect(verified.entitySets).toContain("SalesOrder");
      expect(verified.contract).toMatchObject({ status: "NOT_COMPILED" });
      expect(verified.contract.detail).toMatch(/40 s of contract compile time/);
      expect(verified.contract.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 180_000);

  it("with the compiler turned off: /schema unaffected, the kit and the document 503, the verify's contract NOT_COMPILED", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await verify();
    vi.stubEnv("COREEDGE_CONTRACT_ISOLATES", "0");
    try {
      expect((await data<{ contract: Row }>(await schemaRoute())).contract.schemas).not.toBeNull();
      const kit = await getScaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), { params: Promise.resolve({ id: "if_1" }) });
      expect(kit.status).toBe(503);
      const doc = await getSolutionOpenApi(new NextRequest("http://localhost/api/studio/solutions/sol_1/openapi"), { params: Promise.resolve({ id: "sol_1" }) });
      expect(doc.status).toBe(503);
      // The kill switch stops the work instead of moving it onto this thread: SAP is not asked (consolidated review round 1).
      const sap = vi.fn(async () => xml(RAP));
      vi.stubGlobal("fetch", sap);
      const verified = await data<{ status: string; entitySets: string[]; contract: { status: string; detail: string } }>(await verify());
      expect(sap).not.toHaveBeenCalled();
      expect(verified).toMatchObject({ status: "COMPILER_UNAVAILABLE", verified: false, contract: { status: "NOT_COMPILED" } });
      expect(verified.contract.detail).toMatch(/compiler disabled/);
      expect(verified.entitySets).toContain("SalesOrder");
    } finally {
      vi.unstubAllEnvs();
    }
  }, 180_000);

  it("a small contract is answered byte for byte as before", async () => {
    await verify();
    const res = await schemaRoute();
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-correlation-id")).toBeTruthy();
    const text = await res.text();
    // What NextResponse.json({ data }) would have sent for the same answer.
    expect(text).toBe(JSON.stringify(JSON.parse(text)));
    const d = (JSON.parse(text) as { data: { contract: { schemas: Row } } }).data;
    expect(Object.keys(d.contract.schemas)).toEqual(["record", "create", "update", "key"]);
  });
});
