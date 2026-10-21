// @vitest-environment node
/**
 * STRUCTURAL HARDENING, ROUND 3 (P1.3). Not another expensive shape, but the
 * mechanisms that bound every shape, found or not:
 *
 *   the verify     one organisation's verifies take turns before SAP is asked
 *                  (the envelope's `verify` pool); the datasets cross back as
 *                  a bounded summary, read inside the envelope whether the
 *                  compiler read the description or refused it; and when the
 *                  envelope never ran the job, this thread reads them in
 *                  slices that give the event loop back;
 *   the reads      a read takes its render slot before anything is loaded for
 *                  it, waits its turn instead of being refused, is routed by
 *                  its stored input's size rather than its worst-case budget,
 *                  and draws on one bounded share of the request thread;
 *   the kit        what a render may be handed fits every stored input, and a
 *                  render refused for its input says so.
 */

import { readFileSync } from "fs";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { kitLimit, LIMITS, schemaLimit } from "@/lib/contracts/budget";
import { contractDigest } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import { DATASET_SLICE_CHARS, MAX_LISTED_DATASETS, readDatasets, readDatasetsSliced } from "@/lib/contracts/datasets";
import {
  compileInEnvelope,
  ENVELOPE_RENDER_TENANT_WAITING,
  ENVELOPE_TENANT_RUNNING,
  ENVELOPE_TENANT_WAITING,
  ENVELOPE_VERIFY_TENANT_RUNNING,
  envelopeQueueState,
  withEnvelopeSlot,
} from "@/lib/contracts/envelope";
import type { InterfaceContract } from "@/lib/contracts/ir";
import type { RenderJobInput } from "@/lib/contracts/pipeline";
import { renderReadPath, renderReadPathLazy, rendersOnRequestThread } from "@/lib/contracts/read-render";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { MAX_STORED_ENTITY_SETS, verifyServiceMetadata } from "@/lib/studio/service-verify";

vi.setConfig({ testTimeout: 120_000 });
afterEach(() => vi.restoreAllMocks());

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
  timeoutMs: null,
  environment: "DEV",
  client: "100",
} as unknown as ResolvedSapConnection;

/** A V2 description declaring `sets` entity sets (T0…), of one small type each. */
function manySets(sets: number, extra = ""): string {
  let types = "";
  let container = "";
  for (let i = 0; i < sets; i++) {
    types += `<EntityType Name="T${i}Type"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String" Nullable="false"/></EntityType>`;
    container += `<EntitySet Name="T${i}" EntityType="NS.T${i}Type"/>`;
  }
  return (
    '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">' +
    `<edmx:DataServices m:DataServiceVersion="2.0"><Schema Namespace="NS" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">${types}${extra}` +
    `<EntityContainer Name="C" m:IsDefaultEntityContainer="true">${container}</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`
  );
}

/**
 * The finding's description: 8 MiB of `<EntitySet>` tags (185,000 of them,
 * one shared type) — read whole by a verify, and refused by the compiler
 * (past its element bound) or, here, never compiled at all.
 */
function eightMiBOfSets(): string {
  const head =
    '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"><edmx:DataServices><Schema Namespace="NS" xmlns="http://schemas.microsoft.com/ado/2008/09/edm"><EntityType Name="T"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String"/></EntityType><EntityContainer Name="C">';
  const parts: string[] = [head];
  let n = head.length;
  for (let i = 0; n < 8 * 1024 * 1024 - 200; i++) {
    const tag = `<EntitySet Name="S${i}" EntityType="NS.T"/>`;
    parts.push(tag);
    n += tag.length;
  }
  parts.push("</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>");
  return parts.join("");
}

const xml = (body: string) => new Response(body, { status: 200, headers: { "content-type": "application/xml" } });

/** The longest the event loop went without running a 5 ms ticker while `work` ran. */
async function longestStall<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  let longest = 0;
  let last = performance.now();
  const ticker = setInterval(() => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
  }, 5);
  try {
    const value = await work();
    longest = Math.max(longest, performance.now() - last);
    return { value, ms: longest };
  } finally {
    clearInterval(ticker);
  }
}

describe("the verify: turns, a bounded summary, and no description-sized work on this thread", () => {
  it("one organisation's verifies take turns before SAP is asked: past its share, BUSY with nothing fetched", async () => {
    let release!: () => void;
    const answered = new Promise<void>((resolve) => (release = resolve));
    const fetchImpl = vi.fn(async () => {
      await answered;
      return xml(manySets(3));
    });
    const verify = (organizationId: string) =>
      verifyServiceMetadata(
        { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "T1", organizationId },
        fetchImpl as unknown as typeof fetch,
      );
    const burst = Array.from({ length: 7 }, () => verify("org_burst"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Its share at a time (round 4: a few, so one slow system does not hold them all), whatever the burst.
    expect(fetchImpl).toHaveBeenCalledTimes(ENVELOPE_VERIFY_TENANT_RUNNING);
    // Another organisation is not held up by it.
    const other = verify("org_other");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fetchImpl).toHaveBeenCalledTimes(ENVELOPE_VERIFY_TENANT_RUNNING + 1);
    release();
    const results = await Promise.all(burst);
    const busy = results.filter((r) => r.status === "BUSY");
    expect(busy).toHaveLength(7 - ENVELOPE_VERIFY_TENANT_RUNNING - ENVELOPE_TENANT_WAITING);
    for (const r of busy) expect(r).toMatchObject({ verified: false, httpStatus: null, entitySets: [], auditStatus: 429 });
    // The refused ones never reached SAP; the ones that waited their turn verified.
    expect(fetchImpl).toHaveBeenCalledTimes(ENVELOPE_VERIFY_TENANT_RUNNING + ENVELOPE_TENANT_WAITING + 1);
    for (const r of results.filter((x) => x.status !== "BUSY")) expect(r).toMatchObject({ status: "OK", verified: true });
    expect((await other).status).toBe("OK");
    expect(envelopeQueueState("verify")).toEqual({ running: 0, waiting: 0, runningByTenant: {} });
  });

  it("the datasets cross back from the envelope as a bounded summary, the interface's dataset found past the listed ones", async () => {
    const body = manySets(2000);
    const compiled = await compileInEnvelope(body, "T1999", null);
    if (!compiled.ok) throw new Error(compiled.detail);
    expect(compiled.datasets.names).toHaveLength(MAX_LISTED_DATASETS);
    expect(compiled.datasets).toMatchObject({ count: 2000, hasEntitySet: true, suggestion: null });
    const r = await verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "T1999" },
      (async () => xml(body)) as unknown as typeof fetch,
    );
    expect(r).toMatchObject({ status: "OK", verified: true, entitySetCount: 2000 });
    expect(r.entitySets).toHaveLength(MAX_STORED_ENTITY_SETS);
    expect(r.detail).toContain("(2000 datasets in all)");
    // And a near miss is still a suggestion, found wherever it is.
    const t = await verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "t1999" },
      (async () => xml(body)) as unknown as typeof fetch,
    );
    expect(t).toMatchObject({ status: "ENTITY_SET_MISSING", suggestedEntitySet: "T1999" });
  });

  it("a description the compiler refuses is read by the older reader inside the envelope, in the same job", async () => {
    // A NUL in a documentation text: the compiler refuses it; the older reader still lists the sets.
    const body = manySets(3, '<EntityType Name="Doc"><Documentation><Summary>a\u0000b</Summary></Documentation></EntityType>');
    expect(compileContract(body).ok).toBe(false);
    const compiled = await compileInEnvelope(body, "T2", null);
    expect(compiled).toMatchObject({ ok: false, datasets: { names: ["T0", "T1", "T2"], count: 3, hasEntitySet: true } });
    const r = await verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "T2" },
      (async () => xml(body)) as unknown as typeof fetch,
    );
    expect(r).toMatchObject({ status: "OK", verified: true, entitySets: ["T0", "T1", "T2"], entitySetCount: 3 });
  });

  it("when the envelope never ran the job, this thread reads the datasets in slices, and the event loop keeps ticking", async () => {
    const body = eightMiBOfSets();
    const slices: number[] = [];
    const sliced = await longestStall(() => readDatasetsSliced(body, "S184000", (n) => slices.push(n)));
    // Exactly what the older reader reads in one go…
    expect(sliced.value).toEqual(readDatasets(body, "S184000"));
    expect(sliced.value.count).toBeGreaterThan(180_000);
    expect(sliced.value.names).toHaveLength(MAX_LISTED_DATASETS);
    // …in slices of a fixed size, whatever the description holds.
    expect(slices.length).toBeGreaterThan(100);
    for (const n of slices) expect(n).toBeLessThanOrEqual(DATASET_SLICE_CHARS + 64);
    expect(sliced.ms).toBeLessThan(150);

    // Through the verify: its organisation's compile share is taken, so the compile is refused BUSY.
    vi.spyOn(console, "error").mockImplementation(() => {});
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const holders = Array.from({ length: ENVELOPE_TENANT_RUNNING + ENVELOPE_TENANT_WAITING }, () =>
      withEnvelopeSlot("compile", "org_full", 60_000, () => held),
    );
    const encoded = new TextEncoder().encode(body);
    const r = await longestStall(() =>
      verifyServiceMetadata(
        { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: null, entitySet: "S184000", organizationId: "org_full" },
        (async () => new Response(encoded, { status: 200, headers: { "content-type": "application/xml" } })) as unknown as typeof fetch,
      ),
    );
    release();
    await Promise.all(holders);
    expect(r.value.compiled).toMatchObject({ ok: false, reason: "BUSY" });
    expect(r.value).toMatchObject({ status: "OK", verified: true });
    expect(r.value.entitySetCount).toBeGreaterThan(180_000);
    // Before: the whole description read in one go on this thread (300+ ms per verify, seconds for a burst).
    expect(r.ms).toBeLessThan(250);
  });
});

describe("the reads: slot first, a turn instead of a refusal, routed by cost", () => {
  const FIXTURES = path.resolve(__dirname, "../../fixtures/contracts/edmx");
  function sliced(xmlText: string, set: string): InterfaceContract {
    const r = compileContract(xmlText);
    if (!r.ok) throw new Error(r.detail);
    const s = sliceForEntitySet(r.ir, set, r.sourceLength);
    if (!s.ok) throw new Error(s.detail);
    return s.contract;
  }
  const schemaInput = (contract: InterfaceContract, entitySet: string): RenderJobInput => ({
    path: "schema",
    contract,
    entitySet,
    snapshotId: "snap_1",
    requestSchema: null,
    iface: { version: 1, entitySet },
    limit: LIMITS.schema.cap,
  });
  const small = () => schemaInput(sliced(readFileSync(path.join(FIXTURES, "business-partner.v2.xml"), "utf8"), "A_Partner"), "A_Partner");
  const refilled = () => new Promise((resolve) => setTimeout(resolve, 500));

  /** A contract of `properties` decimal fields, as a large real dataset's slice looks. */
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

  it("a read refused a render slot has loaded nothing; a waiting one loads only once it holds its slot", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    // The organisation's whole share of render slots: one running, every waiting place.
    const running = withEnvelopeSlot("render", "org_r", 60_000, () => held);
    const load = vi.fn(() => Promise.resolve({ ok: true as const, input: small() }));
    const waiting = renderReadPathLazy({ inputBytes: null }, load, { tenant: "org_r" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Waiting for its turn, it has read nothing.
    expect(load).not.toHaveBeenCalled();
    const queued = Array.from({ length: ENVELOPE_RENDER_TENANT_WAITING - 1 }, () => withEnvelopeSlot("render", "org_r", 60_000, () => held));
    const refusedLoad = vi.fn(() => Promise.resolve({ ok: true as const, input: small() }));
    const started = Date.now();
    const refused = await renderReadPathLazy({ inputBytes: null }, refusedLoad, { tenant: "org_r" });
    // Refused at once, having loaded, measured and copied nothing.
    expect(refused).toMatchObject({ ok: false, reason: "UNAVAILABLE" });
    expect(Date.now() - started).toBeLessThan(500);
    expect(refusedLoad).not.toHaveBeenCalled();
    release();
    await Promise.all([running, ...queued]);
    expect(await waiting).toMatchObject({ ok: true, where: "envelope" });
    expect(load).toHaveBeenCalledTimes(1);
    expect(envelopeQueueState("render")).toEqual({ running: 0, waiting: 0, runningByTenant: {} });
  });

  it("five concurrent /schema reads of a 100 KB real-shaped contract, one organisation: all rendered, routed by cost", async () => {
    const c = wide(750);
    expect(c.bytes).toBeGreaterThan(80_000);
    expect(c.bytes).toBeLessThan(200_000);
    await refilled();
    const reads = await Promise.all(
      Array.from({ length: 5 }, () =>
        renderReadPathLazy({ inputBytes: c.bytes }, () => Promise.resolve({ ok: true as const, input: schemaInput(c.contract, "EmpJob") }), {
          tenant: "org_many",
        }),
      ),
    );
    // Before: routed by its worst-case budget to the envelope, and the fourth and fifth refused UNAVAILABLE.
    // Now each is rendered: on this thread while its share of render time lasts, in the envelope after.
    for (const r of reads) expect(r.ok).toBe(true);
    // Routed by what is stored, not by the worst case: its /schema budget is past the 2 MiB that sent
    // it to the envelope before, and its stored input is well inside what this thread renders.
    expect(schemaLimit(c.bytes) + LIMITS.capturedSchema.served).toBeGreaterThan(2 * 1024 * 1024);
    expect(rendersOnRequestThread(c.bytes)).toBe(true);
  });

  it("a burst of reads of a contract at the cap, one organisation: every read served in turn, and the thread keeps ticking", async () => {
    const c = wide(9000);
    expect(c.bytes).toBeGreaterThan(LIMITS.inlineRender.inputBytes);
    const load = vi.fn(() => Promise.resolve({ ok: true as const, input: schemaInput(c.contract, "EmpJob") }));
    const burst = await longestStall(() =>
      Promise.all(Array.from({ length: 6 }, () => renderReadPathLazy({ inputBytes: c.bytes }, load, { tenant: "org_burst_reads" }))),
    );
    for (const r of burst.value) expect(r).toMatchObject({ ok: true, where: "envelope" });
    expect(load).toHaveBeenCalledTimes(6);
    expect(burst.ms).toBeLessThan(250);
  });
});

describe("the kit: what a render may be handed fits what is stored", () => {
  it("a kit with 4.2 MB of recorded fixtures is built inside its budget, not refused for its input", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const records = Array.from({ length: 25 }, (_, i) => ({ PhotoId: String(i), photo: "A".repeat(168_000) }));
    const body = { records };
    const fixtureBytes = Buffer.byteLength(JSON.stringify(body));
    expect(fixtureBytes).toBeGreaterThan(4_200_000);
    expect(fixtureBytes).toBeLessThanOrEqual(LIMITS.fixture.bytes);
    const input: RenderJobInput = {
      path: "kit",
      iface: { id: "if_1", name: "Photos", externalId: "custom:/x", sapProduct: "successfactors", operation: "READ", entitySet: "Photo", version: 1, solutionName: "S" },
      baseUrl: "https://x",
      fixtures: [{ scenario: "data", status: 200, body, sourceStatus: 200, capturedAt: "2026-10-01T00:00:00.000Z" }],
      withheld: [],
      limit: kitLimit(0, fixtureBytes),
    };
    const r = await renderReadPath(input, { tenant: null });
    // Before: refused RESOURCE_LIMIT "input" and told the builder the kit was larger than 32 MB.
    expect(r).toMatchObject({ ok: true, where: "envelope" });
    if (!r.ok) throw new Error("not rendered");
    const files = JSON.parse(new TextDecoder().decode(r.texts[0] as Uint8Array)) as { path: string; contents: string }[];
    expect(files.find((f) => f.path === "fixtures.json")!.contents.length).toBeGreaterThan(4_200_000);
  });
});
