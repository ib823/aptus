// @vitest-environment node
/**
 * STRUCTURAL HARDENING, ROUND 4 (P1.3). Again not another expensive shape,
 * but the mechanisms that bound every shape:
 *
 *   the thread's share   each organisation draws on a part of the request
 *                        thread's render time of its own, and pays for its
 *                        own overruns, so one builder cannot push every other
 *                        tenant's 1 ms read into the envelope;
 *   the render clock     a render on the request thread reads its deadline on
 *                        a time basis, through every build stage, and writes
 *                        at most a bounded number of bytes there; a document
 *                        of many interfaces is never routed as "0 bytes";
 *   what crosses         stored JSON is handed to a worker as its text, never
 *                        walked or structured-cloned on the request thread;
 *   the verify           several verifies per organisation may read at once,
 *                        so one hung SAP does not make the others BUSY, and
 *                        one deadline bounds every wait inside the request;
 *   the instance         the isolates every pool may hold together fit the
 *                        instance's memory beside the server.
 */

import { readFileSync } from "fs";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { contractDigest } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import { LIMITS, schemaLimit, kitLimit, documentLimit, maxDocumentInterfaces } from "@/lib/contracts/budget";
import {
  DEFAULT_INSTANCE_MEMORY_MB,
  ENVELOPE_CONCURRENCY,
  ENVELOPE_LIMITS,
  ENVELOPE_RENDER_CONCURRENCY,
  ENVELOPE_TENANT_RUNNING,
  ENVELOPE_TENANT_WAITING,
  ENVELOPE_VERIFY_TENANT_RUNNING,
  envelopeIsolates,
  envelopeIsolateSlots,
  envelopeQueueState,
  heapLimitBytes,
  instanceMemoryMb,
  isolateFootprintMb,
  runInEnvelope,
  SERVER_HEADROOM_MB,
  withEnvelopeSlot,
} from "@/lib/contracts/envelope";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { renderForRead, type RenderJobInput } from "@/lib/contracts/pipeline";
import { documentInputBytes, renderReadPath, renderReadPathLazy, requestThreadShare, rendersOnRequestThread } from "@/lib/contracts/read-render";
import { hydrateJsonTexts, inputBytesUpTo, jsonTextRef } from "@/lib/contracts/render-input";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { recordContractSnapshot } from "@/lib/contracts/snapshot";
import { fixtureBodies } from "@/lib/studio/fixture-store";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { VERIFY_REQUEST_BUDGET_MS, VERIFY_RESPONSE_MARGIN_MS, verifyServiceMetadata } from "@/lib/studio/service-verify";

type Row = Record<string, unknown>;
/** The rows a test seeds: what the database holds, as Prisma hands them back parsed and as PostgreSQL's ::text gives them. */
const store = vi.hoisted(() => ({ fixtures: [] as Record<string, unknown>[], snapshots: [] as Record<string, unknown>[] }));

vi.mock("@/lib/db/prisma", () => {
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) =>
      v !== null && typeof v === "object" && "in" in (v as Row) ? ((v as { in: unknown[] }).in).includes(row[k]) : (row[k] ?? null) === v,
    );
  const newestFirst = (a: Row, b: Row) => (b.semverMinor as number) - (a.semverMinor as number);
  const pick = (row: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k] ?? null])) : { ...row });
  return {
    prisma: {
      mockFixture: {
        findMany: async ({ where, select }: { where: Row; select?: Row }) => store.fixtures.filter((r) => matches(r, where)).map((r) => pick(r, select)),
      },
      contractSnapshot: {
        findFirst: async ({ where, select }: { where: Row; select?: Row }) => {
          const hit = store.snapshots.filter((r) => matches(r, where)).sort(newestFirst)[0];
          return hit ? pick(hit, select) : null;
        },
        findMany: async ({ where, select, skip }: { where: Row; select?: Row; skip?: number }) =>
          store.snapshots.filter((r) => matches(r, where)).sort(newestFirst).slice(skip ?? 0).map((r) => pick(r, select)),
        create: async ({ data, select }: { data: Row; select?: Row }) => {
          const row = { id: `snap_${store.snapshots.length}`, createdAt: new Date(), ...data };
          store.snapshots.push(row);
          return pick(row, select);
        },
        deleteMany: async () => ({ count: 0 }),
      },
      // The ::text reads (fixture-store.ts, snapshot.ts): the stored JSON as text, as PostgreSQL answers.
      $queryRaw: async (q: { strings?: readonly string[]; sql?: string; values?: unknown[] }) => {
        const sql = q.sql ?? q.strings?.join("") ?? "";
        const values = q.values ?? [];
        if (sql.includes('"MockFixture"')) {
          const [org, iface, ...ids] = values;
          return store.fixtures
            .filter((r) => r.organizationId === org && r.interfaceId === iface && ids.includes(r.id))
            .map((r) => ({ id: r.id, body: JSON.stringify(r.body) }));
        }
        const [org, ...ids] = values;
        return store.snapshots.filter((r) => r.organizationId === org && ids.includes(r.id)).map((r) => ({ id: r.id, ir: JSON.stringify(r.ir) }));
      },
    },
  };
});

vi.setConfig({ testTimeout: 120_000 });
afterEach(() => vi.restoreAllMocks());

const FIXTURES = path.resolve(__dirname, "../../fixtures/contracts/edmx");

function sliced(xmlText: string, set: string): InterfaceContract {
  const r = compileContract(xmlText);
  if (!r.ok) throw new Error(r.detail);
  const s = sliceForEntitySet(r.ir, set, r.sourceLength);
  if (!s.ok) throw new Error(s.detail);
  return s.contract;
}

/** A contract of `properties` decimal fields, as a large real dataset's slice looks (the finding's 5,400 is 505,642 bytes). */
function wide(properties: number): { contract: InterfaceContract; bytes: number } {
  const props = Array.from(
    { length: properties },
    (_, i) => `<Property Name="Field${i}" Type="Edm.Decimal" Precision="9" Scale="2" sap:label="Field label ${i}" sap:quickinfo="Quick info ${i}"/>`,
  ).join("");
  const description =
    `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" ` +
    `xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData"><edmx:DataServices m:DataServiceVersion="2.0">` +
    `<Schema Namespace="S" xmlns="http://schemas.microsoft.com/ado/2008/09/edm"><EntityType Name="EmpJobType"><Key><PropertyRef Name="Field0"/></Key>${props}</EntityType>` +
    `<EntityContainer Name="C" m:IsDefaultEntityContainer="true"><EntitySet Name="EmpJob" EntityType="S.EmpJobType"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
  const contract = sliced(description, "EmpJob");
  return { contract, bytes: contractDigest(contract).bytes };
}

const schemaInput = (contract: InterfaceContract, entitySet: string, bytes: number): RenderJobInput => ({
  path: "schema",
  contract,
  entitySet,
  snapshotId: "snap_1",
  requestSchema: null,
  iface: { version: 1, entitySet },
  limit: schemaLimit(bytes),
});

const refilled = () => new Promise((resolve) => setTimeout(resolve, 600));

/** The longest the event loop went without running a 2 ms ticker while `work` ran. */
async function longestStall<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  let longest = 0;
  let last = performance.now();
  const ticker = setInterval(() => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
  }, 2);
  try {
    const value = await work();
    longest = Math.max(longest, performance.now() - last);
    return { value, ms: longest };
  } finally {
    clearInterval(ticker);
  }
}

/** A solution document of `n` interfaces with no contract: what a builder can make without any SAP. */
function documentOf(n: number): RenderJobInput {
  const interfaces = Array.from({ length: n }, (_, i) => ({
    id: `if_${i}`,
    name: `Interface ${i}`,
    externalId: `custom:/sap/opu/odata/sap/Z_SRV_${i}`,
    sapProduct: "s4hana",
    operation: "READ",
    mode: "READ",
    entitySet: `Set${i}`,
    version: 1,
    status: "DRAFT",
    contract: { source: "none" as const },
    grants: [],
  }));
  return {
    path: "document",
    doc: {
      version: "3.1.0",
      baseUrl: "https://x.example/api/northbound",
      title: "S — CoreEdge northbound",
      infoVersion: "1.0.0+000000000000",
      description: "A document.",
      interfaces,
      discovery: true,
    },
    limit: documentLimit(interfaces.map(() => 0)),
  };
}

describe("the thread's share: each organisation pays for its own renders", () => {
  it("one organisation spending the share and overrunning its clock leaves another's 3 KB /schema rendering on the thread", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const big = wide(3600);
    expect(rendersOnRequestThread(big.bytes)).toBe(true);
    const small = sliced(readFileSync(path.join(FIXTURES, "business-partner.v2.xml"), "utf8"), "A_Partner");
    const smallBytes = contractDigest(small).bytes;
    expect(smallBytes).toBeLessThan(8_000);
    await refilled();
    // The hog's read: inline first, past its clock (TIME), then on to the envelope.
    const hog = renderReadPathLazy({ inputBytes: big.bytes }, () => Promise.resolve({ ok: true as const, input: schemaInput(big.contract, "EmpJob", big.bytes) }), {
      tenant: "org_hog",
    });
    // Its inline attempt has run (synchronously, after its load); it now waits on the envelope.
    await new Promise((resolve) => setImmediate(resolve));
    // Its own part is spent; the thread's share is not.
    expect(requestThreadShare(0, "org_hog")).toBeLessThan(10);
    expect(requestThreadShare()).toBeGreaterThanOrEqual(10);
    // Before: one bucket for everyone, at or below zero — this read went to the envelope (a worker, ~100 ms).
    const victim = await renderReadPathLazy({ inputBytes: smallBytes }, () => Promise.resolve({ ok: true as const, input: schemaInput(small, "A_Partner", smallBytes) }), {
      tenant: "org_victim",
    });
    expect(victim).toMatchObject({ ok: true, where: "request" });
    // And the hog's next read goes straight to the envelope while its part refills.
    const load = vi.fn(() => Promise.resolve({ ok: true as const, input: schemaInput(small, "A_Partner", smallBytes) }));
    expect(await renderReadPathLazy({ inputBytes: smallBytes }, load, { tenant: "org_hog" })).toMatchObject({ ok: true, where: "envelope" });
    expect(await hog).toMatchObject({ ok: true, where: "envelope" });
  });
});

describe("the render clock: read on a time basis, through every stage", () => {
  const GRANT = 10;
  /** Well inside what the review measured before (253-546 ms for the document, 101-147 ms for /schema), with room for a loaded runner. */
  const WITHIN = GRANT + 60;

  it("a 1,016-interface document with no contract stops at its clock, not after building the whole document", () => {
    const input = documentOf(maxDocumentInterfaces());
    for (let i = 0; i < 3; i++) {
      const started = performance.now();
      const r = renderForRead(input, Date.now() + GRANT);
      const took = performance.now() - started;
      expect(r).toMatchObject({ ok: false, reason: "TIME" });
      expect(took).toBeLessThan(WITHIN);
    }
    // Unhurried (the envelope's way), the same document renders.
    expect(renderForRead(input).ok).toBe(true);
  });

  it("a 500 KB contract's /schema and kit stop at their clock", () => {
    const c = wide(3600);
    expect(c.bytes).toBeLessThan(LIMITS.inlineRender.inputBytes);
    const kit: RenderJobInput = {
      path: "kit",
      iface: {
        id: "if_1",
        name: "Jobs",
        externalId: "custom:/x",
        sapProduct: "successfactors",
        operation: "READ",
        entitySet: "EmpJob",
        version: 1,
        solutionName: "S",
        compiled: { semver: "1.0.0", snapshotId: "s", contentHash: "0".repeat(64), compiledAt: new Date(0).toISOString(), contract: c.contract },
      },
      baseUrl: "https://x",
      fixtures: [],
      withheld: [],
      limit: kitLimit(c.bytes),
    };
    for (const input of [schemaInput(c.contract, "EmpJob", c.bytes), kit]) {
      for (let i = 0; i < 3; i++) {
        const started = performance.now();
        const r = renderForRead(input, Date.now() + GRANT);
        expect(r).toMatchObject({ ok: false, reason: "TIME" });
        expect(performance.now() - started).toBeLessThan(WITHIN);
      }
    }
  });

  it("a document of many interfaces is routed by them, never as 0 bytes", () => {
    // Before: a document with no contract was routed as 0 bytes and always tried on the request thread.
    expect(rendersOnRequestThread(documentInputBytes(0, maxDocumentInterfaces()))).toBe(false);
    expect(rendersOnRequestThread(documentInputBytes(0, 20))).toBe(true);
    expect(documentInputBytes(null, 3)).toBeNull();
  });

  it("on the request thread a render writes at most its inline bytes, and is handed on past them; the envelope renders it whole", () => {
    const c = wide(6500);
    const input = schemaInput(c.contract, "EmpJob", c.bytes);
    const whole = renderForRead(input);
    if (!whole.ok) throw new Error("not rendered");
    const written = whole.texts.reduce((n, t) => n + (typeof t === "string" ? Buffer.byteLength(t) : t.byteLength), 0);
    expect(written).toBeGreaterThan(LIMITS.inlineRender.outputBytes);
    // With all the time in the world, still handed on: TIME, never TOO_LARGE.
    expect(renderForRead(input, Date.now() + 600_000)).toMatchObject({ ok: false, reason: "TIME" });
  });
});

describe("what crosses into a worker: stored JSON as its text", () => {
  it("a reference stands for its value, is counted by its length, and is parsed only where it is used", () => {
    const value = { records: [{ a: 1 }, { b: "x" }] };
    const text = JSON.stringify(value);
    const input = { path: "kit", fixtures: [{ scenario: "data", body: jsonTextRef<unknown>(text) }] };
    // Counted by the text's length (and the structure around it), never walked.
    expect(inputBytesUpTo(input, 1e9)).toBeGreaterThanOrEqual(text.length);
    const hydrated = hydrateJsonTexts(input);
    expect(hydrated.fixtures[0]!.body).toEqual(value);
    // Not in place: the caller's input still carries its text.
    expect(input.fixtures[0]!.body).not.toEqual(value);
    // Stored data shaped like a reference is never ours to fail on: not JSON, or not of the one key, it is left as it is…
    const lookalike = { a: { __coreedgeStoredJsonText: "not json" }, b: { __coreedgeStoredJsonText: "1", other: 2 } };
    expect(hydrateJsonTexts(lookalike)).toEqual(lookalike);
    // …and a key "__proto__" is set as a member, never as a prototype.
    const proto = JSON.parse('{"__proto__": {"__coreedgeStoredJsonText": "{\\"x\\": 1}"}}') as Record<string, unknown>;
    const out = hydrateJsonTexts(proto);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toEqual({ x: 1 });
  });

  it("a kit's 7.4 MB of small-record fixtures, read by the kit's own loader, leave the event loop ticking", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bodies = Array.from({ length: 2 }, (_, f) => ({
      records: Array.from({ length: 200_000 }, (_, i) => ({ I: i, N: f })),
    }));
    store.fixtures = bodies.map((body, i) => ({ id: `fx_${i}`, organizationId: "org_kit", interfaceId: "if_1", body }));
    const fixtureBytes = bodies.reduce((n, b) => n + JSON.stringify(b).length, 0);
    expect(fixtureBytes).toBeGreaterThan(7_000_000);
    expect(fixtureBytes).toBeLessThanOrEqual(LIMITS.fixture.storedTextBytes);
    const k = await longestStall(async () => {
      // As the kit route reads them (fixture-store.ts), and hands them to its render.
      const read = await fixtureBodies("org_kit", "if_1", ["fx_0", "fx_1"]);
      const kit: RenderJobInput = {
        path: "kit",
        iface: { id: "if_1", name: "Rows", externalId: "custom:/x", sapProduct: "s4hana", operation: "READ", entitySet: "Rows", version: 1, solutionName: "S" },
        baseUrl: "https://x",
        fixtures: ["fx_0", "fx_1"].map((id, i) => ({ scenario: i === 0 ? "data" : "empty", status: 200, body: read.get(id), sourceStatus: 200, capturedAt: "2026-10-01T00:00:00.000Z" })),
        withheld: [],
        limit: kitLimit(0, fixtureBytes),
      };
      return renderReadPathLazy({ inputBytes: fixtureBytes }, () => Promise.resolve({ ok: true as const, input: kit }), { tenant: "org_kit" });
    });
    expect(k.value).toMatchObject({ ok: true, where: "envelope" });
    if (!k.value.ok) throw new Error("not rendered");
    // What was rendered is the recorded rows, parsed in the worker.
    const files = JSON.parse(new TextDecoder().decode(k.value.texts[0] as Uint8Array)) as { path: string; contents: string }[];
    expect(files.find((f) => f.path === "fixtures.json")!.contents).toContain('"I": 199999');
    // Before: the bodies parsed objects, walked and structured-cloned on this thread (416-527 ms measured at 7.6 MB).
    expect(k.ms).toBeLessThan(200);
  });

  it("a record's diff against four environments' 1.9 MB contracts leaves the event loop ticking", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const c = wide(13_500);
    expect(c.bytes).toBeGreaterThan(1_800_000);
    const envs = [null, "SANDBOX", "DEV", "TEST"];
    store.snapshots = envs.map((environment, i) => ({
      id: `snap_${i}`,
      organizationId: "org_diff",
      interfaceId: "if_1",
      semver: `1.${i}.0`,
      semverMajor: 1,
      semverMinor: i,
      semverPatch: 0,
      contentHash: `${i}`.repeat(64),
      source: "METADATA",
      odataVersion: "V2",
      entitySet: "EmpJob",
      externalId: "custom:/x",
      interfaceVersion: 1,
      createdAt: new Date(0),
      environment,
      ir: c.contract,
    }));
    const d = await longestStall(() =>
      recordContractSnapshot({
        scope: tenantScopeOf("org_diff"),
        iface: { id: "if_1", version: 1, externalId: "custom:/x", entitySet: "EmpJob" },
        contract: c.contract,
        prepared: { hash: "f".repeat(64), bytes: c.bytes },
        environment: "PROD",
      }),
    );
    expect(d.value).toMatchObject({ status: "RECORDED" });
    // Before: the previous IRs (as Prisma parses them) walked and cloned here — 329 ms measured for five.
    expect(d.ms).toBeLessThan(200);
  });
});

const CONNECTION = {
  source: "db",
  id: "conn_dev",
  organizationId: "org_a",
  product: "s4hana-onprem",
  key: "dev",
  label: "ERP DEV",
  baseUrl: "https://erp.example.internal:44300",
  authType: "basic",
  secrets: { username: "u", password: "p" },
  oauthTokenUrl: null,
  writeEnabled: false,
  apiPath: null,
  timeoutMs: 4000,
  environment: "DEV",
  client: "100",
} as unknown as ResolvedSapConnection;

const ONE_SET =
  '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">' +
  '<edmx:DataServices m:DataServiceVersion="2.0"><Schema Namespace="NS" xmlns="http://schemas.microsoft.com/ado/2008/09/edm"><EntityType Name="TType"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String" Nullable="false"/></EntityType>' +
  '<EntityContainer Name="C" m:IsDefaultEntityContainer="true"><EntitySet Name="T" EntityType="NS.TType"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
const xml = (body: string) => new Response(body, { status: 200, headers: { "content-type": "application/xml" } });

describe("the verify: several reads per organisation, one deadline", () => {
  it("a hung SAP for one interface does not make a teammate's verify of a healthy system BUSY", async () => {
    const hung = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );
    const healthy = vi.fn(async () => xml(ONE_SET));
    const first = verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_ONE_SRV", declaredVersion: "V2", entitySet: "T", organizationId: "org_team" },
      hung as unknown as typeof fetch,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const started = Date.now();
    const second = await verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_TWO_SRV", declaredVersion: "V2", entitySet: "T", organizationId: "org_team" },
      healthy as unknown as typeof fetch,
    );
    // Before: it waited for the hung one's turn (its whole timeout), or answered BUSY with SAP never asked.
    expect(second).toMatchObject({ status: "OK", verified: true });
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(3000);
    expect((await first).status).toBe("TIMEOUT");
    expect(ENVELOPE_VERIFY_TENANT_RUNNING).toBe(ENVELOPE_TENANT_RUNNING + ENVELOPE_TENANT_WAITING);
    expect(envelopeQueueState("verify")).toEqual({ running: 0, waiting: 0, runningByTenant: {} });
  });

  it("every wait inside the verify ends by its deadline: compile slots held elsewhere make the contract BUSY, and the verify answers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const holders = ["org_x", "org_y"].map((t) => withEnvelopeSlot("compile", t, 60_000, () => held));
    const started = Date.now();
    const r = await verifyServiceMetadata(
      {
        connection: CONNECTION,
        servicePath: "/sap/opu/odata/sap/Z_SRV",
        declaredVersion: "V2",
        entitySet: "T",
        organizationId: "org_late",
        deadlineAt: Date.now() + 2500,
      },
      (async () => xml(ONE_SET)) as unknown as typeof fetch,
    );
    const took = Date.now() - started;
    release();
    await Promise.all(holders);
    // Before: the compile waited its own 15 s for a slot, whatever the request had left.
    expect(took).toBeLessThan(5000);
    expect(r).toMatchObject({ status: "OK", verified: true, entitySets: ["T"] });
    expect(r.compiled).toMatchObject({ ok: false, reason: "BUSY" });
  });

  it("the verify's budget and its margin fit the route's platform limit", () => {
    const route = readFileSync(path.resolve(__dirname, "../../../src/app/api/studio/interfaces/[id]/verify-service/route.ts"), "utf8");
    const maxDuration = Number(/export const maxDuration = (\d+);/.exec(route)?.[1]);
    expect(maxDuration).toBeGreaterThan(0);
    expect(VERIFY_REQUEST_BUDGET_MS + VERIFY_RESPONSE_MARGIN_MS).toBeLessThanOrEqual(maxDuration * 1000);
    // The margin covers a worker cut at the deadline (its exit grace, 5 s) and the route's own writes.
    expect(VERIFY_RESPONSE_MARGIN_MS).toBeGreaterThanOrEqual(10_000);
  });
});

describe("the instance: every pool's isolates together fit its memory", () => {
  it("the isolates the envelope may hold at once, each at its heap cap, and the server fit the instance", () => {
    expect(instanceMemoryMb()).toBeLessThanOrEqual(DEFAULT_INSTANCE_MEMORY_MB);
    for (const kind of Object.keys(ENVELOPE_LIMITS) as (keyof typeof ENVELOPE_LIMITS)[]) {
      expect(heapLimitBytes(ENVELOPE_LIMITS[kind]) / (1024 * 1024)).toBeLessThanOrEqual(isolateFootprintMb());
    }
    expect(envelopeIsolateSlots() * isolateFootprintMb() + SERVER_HEADROOM_MB).toBeLessThanOrEqual(instanceMemoryMb());
    // Before: two compile slots and two render slots, each its own isolate — four, on 2 GB.
    expect(envelopeIsolateSlots()).toBeLessThan(ENVELOPE_CONCURRENCY + ENVELOPE_RENDER_CONCURRENCY);
  });

  it("two compiles and two renders at once never hold more isolates than the instance has slots", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const c = wide(3000);
    envelopeIsolates();
    const description = readFileSync(path.join(FIXTURES, "business-partner.v2.xml"), "utf8");
    const jobs = [
      ...["org_1", "org_2"].map((tenant) => runInEnvelope({ kind: "compile", input: { body: description, entitySet: "A_Partner", subject: null } }, undefined, { tenant })),
      ...["org_3", "org_4"].map((tenant) =>
        runInEnvelope({ kind: "render", input: schemaInput(c.contract, "EmpJob", c.bytes) }, undefined, { tenant }),
      ),
    ];
    const results = await Promise.all(jobs);
    for (const r of results) expect(r.ok).toBe(true);
    expect(envelopeIsolates().peak).toBeLessThanOrEqual(envelopeIsolateSlots());
    expect(envelopeQueueState("isolate")).toEqual({ running: 0, waiting: 0, runningByTenant: {} });
  });
});
