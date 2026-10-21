// @vitest-environment node
/**
 * THE CONTRACT COMPILER'S JOBS AND WRITES, against real PostgreSQL (P1.3).
 * The request thread's work around the jobs, each bounded by construction
 * whatever the input —
 *
 *   one statement     a document's current snapshots are one DISTINCT ON,
 *                     however many interfaces it carries;
 *   what is rendered  a document's grants are only the granting, live rows,
 *                     distinct — never every grant request ever filed;
 *   text, both ways   a fixture and a recorded contract with its diff and its
 *                     /schema texts cross back from the worker and into
 *                     PostgreSQL as strings, never as object graphs;
 *   one transaction   a capture stores its schema, its SAMPLED snapshot and
 *                     its texts together, or nothing — and a capture the
 *                     compiler could not take stores nothing and says so;
 *   compiler time     each organisation's worker time per UTC day
 *                     (contract-time.ts): refused past it with 00:00 UTC,
 *                     charged with the wall time of every job, downloads
 *                     included, another organisation never affected.
 *
 * Opt-in on TEST_DATABASE_URL; rows are namespaced and removed.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { longestStall } from "../helpers/stall";

vi.setConfig({ testTimeout: 180_000 });

/** Every statement the app's client sends, counted (the base client's query events). */
const counter = vi.hoisted(() => ({ queries: 0, onQuery: null as ((query: string, params: string) => void) | null }));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
    log: [{ emit: "event", level: "query" }],
  });
  base.$on("query", (e) => {
    counter.queries += 1;
    counter.onQuery?.(e.query, e.params);
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u_r5", email: "dev@abeam.com", role: "consultant", organizationId: ORG, authMethod: "session" }),
}));
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: vi.fn() }));

import { POST as captureFixture } from "@/app/api/studio/interfaces/[id]/capture-fixture/route";
import { POST as captureSchema } from "@/app/api/studio/interfaces/[id]/capture-schema/route";
import { GET as scaffold } from "@/app/api/studio/interfaces/[id]/scaffold/route";
import { LIMITS } from "@/lib/contracts/budget";
import { compileContract } from "@/lib/contracts/compile";
import { chargeContractTime, checkContractTime, nextUtcMidnight, reserveContractTime } from "@/lib/contracts/contract-time";
import { planDocInputs } from "@/lib/contracts/doc-inputs";
import { CONTRACT_JOB_LIMITS, contractJobAdmission, runJobInEnvelope } from "@/lib/contracts/envelope";
import { recordJob, type CompiledService, type Job } from "@/lib/contracts/jobs";
import { recordVerifiedContract, snapshotBodies } from "@/lib/contracts/record";
import { SCHEMA_TEXTS_VERSION } from "@/lib/contracts/render-version";
import { rerenderSchemaTexts } from "@/lib/contracts/rerender";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import * as snapshots from "@/lib/contracts/snapshot";
import { prisma } from "@/lib/db/prisma";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const RUN = `r5-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const OTHER = `${RUN}-other`;
const BUSINESS_PARTNER = readFileSync(path.resolve(__dirname, "../fixtures/contracts/edmx/business-partner.v2.xml"), "utf8");
const scope = tenantScopeOf(ORG);
let solutionId = "";

/** The statements `work` sent. */
async function counted<T>(work: () => Promise<T>): Promise<{ value: T; queries: number }> {
  const before = counter.queries;
  const value = await work();
  return { value, queries: counter.queries - before };
}

/** A V2 description of one entity set of `properties` decimal fields, labelled: about 145 canonical bytes a field. */
function wideDescription(properties: number, prefix = "Field"): string {
  const props = Array.from(
    { length: properties },
    (_, i) => `<Property Name="${prefix}${i}" Type="Edm.Decimal" Precision="9" Scale="2" sap:label="Field label ${i}" sap:quickinfo="Quick info ${i}"/>`,
  ).join("");
  return (
    `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" ` +
    `xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData"><edmx:DataServices m:DataServiceVersion="2.0">` +
    `<Schema Namespace="S" xmlns="http://schemas.microsoft.com/ado/2008/09/edm"><EntityType Name="EmpJobType"><Key><PropertyRef Name="${prefix}0"/></Key>${props}</EntityType>` +
    `<EntityContainer Name="C" m:IsDefaultEntityContainer="true"><EntitySet Name="EmpJob" EntityType="S.EmpJobType" sap:creatable="false"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`
  );
}

async function newInterface(name: string, over: Record<string, unknown> = {}) {
  return prisma.interface.create({
    data: {
      organizationId: ORG,
      solutionId,
      name,
      sapProduct: "s4hana",
      externalId: "custom:/sap/opu/odata/sap/ZR5_SRV",
      operation: "READ",
      mode: "READ",
      entitySet: "EmpJob",
      ...over,
    },
    select: { id: true, version: true, externalId: true, entitySet: true, operation: true, mode: true },
  });
}

/** The organisation's compiler time today, in ms (0 when no row). */
async function msToday(organizationId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ ms: number }[]>`SELECT "ms" FROM "ContractTime" WHERE "organizationId" = ${organizationId} AND "day" = ${new Date().toISOString().slice(0, 10)}::date`;
  return rows[0]?.ms ?? 0;
}

/** The deadlines its jobs in flight hold today, in ms (0 when no row). */
async function reservedToday(organizationId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ ms: number }[]>`SELECT "reservedMs" AS "ms" FROM "ContractTime" WHERE "organizationId" = ${organizationId} AND "day" = ${new Date().toISOString().slice(0, 10)}::date`;
  return rows[0]?.ms ?? 0;
}

const post = (url: string, body: string) =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body });

describe.skipIf(!process.env.TEST_DATABASE_URL)("the Contract Compiler's jobs and writes, against real PostgreSQL", () => {
  beforeAll(async () => {
    for (const id of [ORG, OTHER]) await prisma.organization.create({ data: { id, name: `R5 ${id}`, type: "client" } });
    const s = await prisma.solution.create({
      data: {
        organizationId: ORG,
        name: "Round 5",
        slug: `${RUN}-app`,
        classification: "CLIENT_APP",
        businessProblem: "Round 5.",
        dataClass: "INTERNAL",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    solutionId = s.id;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "ContractTime" WHERE "organizationId" IN (${ORG}, ${OTHER})`;
    await prisma.apiAccessGrant.deleteMany({ where: { organizationId: ORG } });
    await prisma.mockFixture.deleteMany({ where: { organizationId: ORG } });
    await prisma.contractSnapshot.deleteMany({ where: { organizationId: { in: [ORG, OTHER] } } });
    await prisma.interface.deleteMany({ where: { organizationId: { in: [ORG, OTHER] } } });
    await prisma.solution.deleteMany({ where: { organizationId: { in: [ORG, OTHER] } } });
    for (const id of [ORG, OTHER]) await prisma.organization.delete({ where: { id } });
    await prisma.$disconnect();
  });

  it("a document's current snapshots are one statement for 1,016 interfaces, each the newest describing it now", async () => {
    const n = 1016;
    await prisma.interface.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        id: `${RUN}-many-${i}`,
        organizationId: ORG,
        solutionId,
        name: `many ${i}`,
        sapProduct: "s4hana",
        externalId: "custom:/sap/opu/odata/sap/ZMANY_SRV",
        operation: "READ",
        mode: "READ",
        entitySet: "Rows",
      })),
    });
    const interfaces = await prisma.interface.findMany({
      where: { organizationId: ORG, id: { startsWith: `${RUN}-many-` } },
      select: { id: true, externalId: true, entitySet: true },
    });
    const snap = (interfaceId: string, minor: number, over: Record<string, unknown> = {}) => ({
      organizationId: ORG,
      interfaceId,
      interfaceVersion: 1,
      externalId: "custom:/sap/opu/odata/sap/ZMANY_SRV",
      entitySet: "Rows",
      source: "METADATA",
      odataVersion: "V2",
      semver: `1.${minor}.0`,
      semverMajor: 1,
      semverMinor: minor,
      semverPatch: 0,
      contentHash: `${minor}`.repeat(64),
      ir: {},
      irVersion: 1,
      irBytes: 100 + minor,
      ...over,
    });
    const [a, b, c] = interfaces.map((i) => i.id).sort();
    await prisma.contractSnapshot.createMany({
      data: [
        // a: two versions; the newer describes it.
        snap(a!, 0),
        snap(a!, 1),
        // b: the newest is of another dataset, so the older one is current.
        snap(b!, 0),
        snap(b!, 1, { entitySet: "Other" }),
        // c: only another service's: none current.
        snap(c!, 0, { externalId: "custom:/elsewhere" }),
      ],
    });
    // Another organisation's row of the same interface id is never anyone's.
    await prisma.contractSnapshot.create({ data: { ...snap(c!, 5), organizationId: OTHER } });

    const read = await counted(() => longestStall(() => snapshots.currentSnapshotSummaries(scope, interfaces)));
    const summaries = read.value.value;
    expect([...summaries.keys()].sort()).toEqual([a, b].sort());
    expect(summaries.get(a!)).toMatchObject({ semver: "1.1.0", irBytes: 101, source: "METADATA", entitySet: "Rows" });
    expect(summaries.get(b!)).toMatchObject({ semver: "1.0.0", irBytes: 100 });
    // Before: one findFirst per interface — 1,016 statements, 230-610 ms of blocked event loop.
    expect(read.queries).toBe(1);
    expect(read.value.ms).toBeLessThan(200);

    // And the whole plan of a document of them: a constant number of statements.
    const plan = await counted(() => planDocInputs(scope, interfaces));
    expect(plan.queries).toBeLessThanOrEqual(2);
  });

  it("a document reads only the grants it renders: 100,000 grant requests cost it nothing", async () => {
    const one = await newInterface("granted");
    const base = {
      organizationId: ORG,
      solutionId,
      externalId: one.externalId,
      justification: "x",
      interfaceId: one.id,
    };
    const requests = Array.from({ length: 100_000 }, (_, i) => ({ ...base, id: `${RUN}-req-${i}`, operation: "READ", environment: "PROD" }));
    for (let i = 0; i < requests.length; i += 10_000) await prisma.apiAccessGrant.createMany({ data: requests.slice(i, i + 10_000) });
    const past = new Date(Date.now() - 60_000);
    await prisma.apiAccessGrant.createMany({
      data: [
        { ...base, operation: "READ", environment: "DEV", decision: "APPROVED" },
        { ...base, operation: "READ", environment: "DEV", decision: "APPROVED" },
        { ...base, operation: "READ", environment: "TEST", decision: "READ_ONLY" },
        { ...base, operation: "CREATE", environment: "TEST", decision: "READ_ONLY" },
        { ...base, operation: "READ", environment: "SANDBOX", decision: "SANDBOX_ONLY" },
        { ...base, operation: "READ", environment: "PROD", decision: "SANDBOX_ONLY" },
        { ...base, operation: "CREATE", environment: "DEV", decision: "APPROVED" },
        { ...base, operation: "READ", environment: "PROD", decision: "APPROVED", expiresAt: past },
        { ...base, operation: "UPDATE", environment: "PROD", decision: "APPROVED", revokedAt: past },
        { ...base, operation: "READ", environment: "PROD", decision: "REJECTED" },
      ],
    });
    const r = await counted(() => longestStall(() => planDocInputs(scope, [one])));
    // Before: every request loaded and dropped here — 400-625 ms of blocked event loop.
    expect(r.value.ms).toBeLessThan(150);
    expect(r.queries).toBeLessThanOrEqual(2);
    const plan = r.value.value;
    if (!plan.ok) throw new Error("refused");
    const grants = [...(plan.grants.get(one.id) ?? [])].sort((x, y) => `${x.operation}${x.environment}`.localeCompare(`${y.operation}${y.environment}`));
    // Exactly what grantsRead and grantsWrite allow, once each.
    expect(grants).toEqual([
      { operation: "CREATE", environment: "DEV" },
      { operation: "READ", environment: "DEV" },
      { operation: "READ", environment: "SANDBOX" },
      { operation: "READ", environment: "TEST" },
    ]);
  });

  it("a fixture at its bound is stored from its text: the event loop keeps ticking", async () => {
    const iface = await newInterface("fixtures");
    const rows = Array.from({ length: 25 }, () => ({ a: Array.from({ length: 92_000 }, (_, i) => i % 10) }));
    const bodyText = JSON.stringify({ rows, readStatus: "OK", interfaceVersion: iface.version, entitySet: iface.entitySet, sourceStatus: 200 });
    expect(bodyText.length).toBeGreaterThan(4_500_000);
    expect(bodyText.length).toBeLessThan(LIMITS.fixture.bytes);
    const send = () => captureFixture(post(`http://localhost/api/studio/interfaces/${iface.id}/capture-fixture`, bodyText), { params: Promise.resolve({ id: iface.id }) });
    // Created, then replaced: both writes. The body is parsed in the fixture job, never here.
    const parse = vi.spyOn(JSON, "parse");
    for (const replaced of [false, true]) {
      const r = await longestStall(send);
      expect(r.value.status).toBe(200);
      expect(((await r.value.json()) as { data: { replaced: boolean; rows: number } }).data).toMatchObject({ replaced, rows: 25 });
      // Before: parsed here, and Prisma serialised the 2.3 million nodes on this thread — 1.4-1.7 s.
      expect(r.ms).toBeLessThan(600);
    }
    expect(parse.mock.calls.some(([text]) => text === bodyText)).toBe(false);
    parse.mockRestore();
    const stored = await prisma.mockFixture.findMany({ where: { organizationId: ORG, interfaceId: iface.id }, select: { body: true, scenario: true } });
    expect(stored).toHaveLength(1);
    const body = stored[0]!.body as { records: { a: number[] }[] };
    expect(body.records).toHaveLength(25);
    expect(body.records[24]!.a[91_999]).toBe(91_999 % 10);
  });

  it("a recorded 100 KB contract (over half a MiB of /schema texts) crosses back and is stored as its text with its texts: the event loop keeps ticking", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const iface = await newInterface("recorded", { operation: "CREATE", mode: "WRITE" });
    const entitySet = iface.entitySet!;
    const record = async (description: string) => {
      const heads = await snapshots.loadRecordHeads(scope, iface, "DEV");
      const compiled = await longestStall(() => runJobInEnvelope({ kind: "record", input: { description, entitySet, ...heads } }, { tenant: ORG }));
      const value = compiled.value;
      const c: CompiledService = value.ok ? value.value : { ok: false, reason: value.reason, detail: value.detail };
      const recorded = await longestStall(() =>
        recordVerifiedContract({ scope, iface: { ...iface, entitySet }, compiled: c, heads, environment: "DEV", connectionId: "conn_dev", actorId: "u_r5" }),
      );
      return { compiled: { value: c, ms: compiled.ms }, recorded };
    };
    const first = await record(wideDescription(750));
    expect(first.recorded.value).toMatchObject({ status: "RECORDED", semver: "1.0.0" });
    const c = first.compiled.value;
    if (!c.ok || !c.dataset?.ok) throw new Error("not compiled");
    expect(c.dataset.bytes).toBeGreaterThan(100_000);
    expect(c.dataset.texts.schemas.byteLength + (c.dataset.texts.update?.byteLength ?? 0)).toBeGreaterThan(512 * 1024);
    // What crossed back from the worker is the contract's text, as transferred bytes, never its object graph.
    expect(c.dataset.ir).toBeInstanceOf(Uint8Array);
    expect(c.dataset.facts).toMatchObject({ source: "METADATA", odataVersion: "V2", bodies: { create: false, update: true } });

    // Another contract: a new version, its diff taken in the same job and stored as its text.
    const second = await record(wideDescription(750, "Other"));
    expect(second.recorded.value).toMatchObject({ status: "RECORDED", semver: "2.0.0", bump: "major" });
    expect(second.compiled.ms).toBeLessThan(150);
    expect(second.recorded.ms).toBeLessThan(150);

    const rows = await prisma.contractSnapshot.findMany({
      where: { organizationId: ORG, interfaceId: iface.id },
      orderBy: { semverMajor: "asc" },
      select: { id: true, ir: true, diff: true, irBytes: true, source: true, odataVersion: true, irVersion: true, schemasText: true },
    });
    expect(rows).toHaveLength(2);
    const ir = rows[1]!.ir as { entityType: { properties: { name: string }[] }; source: string };
    expect(ir.entityType.properties).toHaveLength(750);
    expect(ir.entityType.properties[0]!.name).toBe("Other0");
    expect(rows[1]).toMatchObject({ source: "METADATA", odataVersion: "V2", irVersion: 1 });
    expect((rows[1]!.diff as { bump: string; changes: unknown[] }).bump).toBe("major");
    expect(rows[0]!.diff).toBeNull();
    // The /schema texts on the newest row only.
    expect(rows[0]!.schemasText).toBeNull();
    expect(JSON.parse(rows[1]!.schemasText!)).toHaveProperty("record");
    // The write's body is decided from the two capabilities, read in the database.
    expect(await snapshotBodies(prisma, scope, rows[1]!.id)).toEqual({ create: false, update: true });
  });

  it("/schema texts past 1 MiB are refused at record (OUTPUT_TOO_LARGE), and nothing is stored", async () => {
    const iface = await newInterface("too-wide");
    const entitySet = iface.entitySet!;
    const compiled = recordJob({ description: wideDescription(13_500), entitySet, previous: [], unchangedHashes: [] });
    expect(compiled).toMatchObject({ ok: true, dataset: { ok: false, reason: "OUTPUT_TOO_LARGE" } });
    const outcome = await recordVerifiedContract({ scope, iface: { ...iface, entitySet }, compiled, heads: { ids: [] }, environment: "DEV", connectionId: "c", actorId: "u" });
    expect(outcome).toMatchObject({ status: "NOT_COMPILED" });
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(0);
  });

  it("a snapshot's bodies are read from its capabilities as the IR states them", async () => {
    const iface = await newInterface("bodies");
    const cases: [Record<string, unknown>, boolean | undefined, { create: boolean; update: boolean }][] = [
      [{}, undefined, { create: true, update: true }],
      [{ creatable: false, updatable: false }, undefined, { create: false, update: false }],
      [{ creatable: true }, true, { create: false, update: true }],
    ];
    let minor = 0;
    for (const [capabilities, singleton, expected] of cases) {
      const r = compileContract(wideDescription(2));
      if (!r.ok) throw new Error(r.detail);
      const s = sliceForEntitySet(r.ir, "EmpJob");
      if (!s.ok) throw new Error(s.detail);
      const ir = { ...s.contract, entitySet: { ...s.contract.entitySet, capabilities, ...(singleton ? { singleton } : {}) } };
      const row = await prisma.contractSnapshot.create({
        data: {
          organizationId: ORG,
          interfaceId: iface.id,
          interfaceVersion: 1,
          externalId: iface.externalId,
          entitySet: "EmpJob",
          source: "METADATA",
          odataVersion: "V2",
          semver: `1.${minor}.0`,
          semverMajor: 1,
          semverMinor: minor++,
          semverPatch: 0,
          contentHash: "a".repeat(64),
          ir: ir as never,
          irVersion: 1,
        },
        select: { id: true },
      });
      expect(await snapshotBodies(prisma, scope, row.id)).toEqual(expected);
    }
    expect(await snapshotBodies(prisma, tenantScopeOf(OTHER), "nope")).toBeNull();
  });

  it("a capture stores its schema, its SAMPLED snapshot and its texts together, or nothing and says why", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const iface = await newInterface("capture", { odataVersion: "V2", servicePath: "/sap/opu/odata/sap/ZR5_SRV" });
    const url = `http://localhost/api/studio/interfaces/${iface.id}/capture-schema`;
    const bodyText = JSON.stringify({ rows: [{ Id: "1", Amount: 2 }, { Id: "2", Amount: 3 }], interfaceVersion: iface.version, entitySet: iface.entitySet });
    const stored = async () => ({
      schema: (await prisma.interface.findFirst({ where: { id: iface.id, organizationId: ORG }, select: { responseSchema: true } }))?.responseSchema ?? null,
      snapshots: await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } }),
    });

    // The compiler turned off: 503, and nothing stored.
    vi.stubEnv("COREEDGE_CONTRACT_ISOLATES", "0");
    const off = await captureSchema(post(url, bodyText), { params: Promise.resolve({ id: iface.id }) });
    vi.unstubAllEnvs();
    expect(off.status).toBe(503);
    expect(((await off.json()) as { error: { message: string } }).error.message).toContain("Nothing was captured");
    expect(await stored()).toEqual({ schema: null, snapshots: 0 });

    // The organisation's time spent: 429 until 00:00 UTC, its own words, and nothing stored.
    vi.stubEnv("COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY", "1");
    await chargeContractTime(ORG, 1_000);
    const spent = await captureSchema(post(url, bodyText), { params: Promise.resolve({ id: iface.id }) });
    vi.unstubAllEnvs();
    expect(spent.status).toBe(429);
    expect(Number(spent.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(spent.headers.get("retry-after"))).toBeLessThanOrEqual(86_400);
    expect(((await spent.json()) as { error: { message: string } }).error.message).toContain("1 s of contract compile time");
    expect(await stored()).toEqual({ schema: null, snapshots: 0 });

    // Captured: the schema, the SAMPLED snapshot and its texts, in one transaction — and the body never parsed here.
    const parse = vi.spyOn(JSON, "parse");
    const ok = await captureSchema(post(url, bodyText), { params: Promise.resolve({ id: iface.id }) });
    expect(parse.mock.calls.some(([text]) => text === bodyText)).toBe(false);
    parse.mockRestore();
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: { fields: number; contract: { status: string } } }).data).toMatchObject({ fields: 2, contract: { status: "RECORDED" } });
    const after = await stored();
    expect(after.schema).toMatchObject({ type: "object", properties: { Id: { type: "string" } } });
    expect(after.snapshots).toBe(1);
    const row = await prisma.contractSnapshot.findFirst({ where: { organizationId: ORG, interfaceId: iface.id }, select: { source: true, schemasText: true } });
    expect(row?.source).toBe("SAMPLED");
    expect(row?.schemasText).not.toBeNull();
  });

  it("each organisation's compiler time: refused past it with 00:00 UTC, another organisation unaffected, old days pruned", async () => {
    vi.stubEnv("COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY", "40");
    // A fake day: the allowance is the UTC day's, whatever the clock says.
    const day = new Date("2031-03-04T22:15:00.000Z");
    expect(await checkContractTime(OTHER, day)).toEqual({ ok: true });
    await chargeContractTime(OTHER, 39_999, day);
    expect(await checkContractTime(OTHER, day)).toEqual({ ok: true });
    await chargeContractTime(OTHER, 1, day);
    const refused = await checkContractTime(OTHER, day);
    expect(refused).toMatchObject({ ok: false, retryAfterMs: nextUtcMidnight(day).getTime() - day.getTime() });
    expect(nextUtcMidnight(day).toISOString()).toBe("2031-03-05T00:00:00.000Z");
    expect(!refused.ok && refused.detail).toContain("40 s of contract compile time");
    // Another organisation's day, and the next day, are untouched.
    expect(await checkContractTime(ORG, day)).toEqual({ ok: true });
    expect(await checkContractTime(OTHER, new Date("2031-03-05T00:00:01.000Z"))).toEqual({ ok: true });
    // 0 is unlimited.
    vi.stubEnv("COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY", "0");
    expect(await checkContractTime(OTHER, day)).toEqual({ ok: true });
    vi.unstubAllEnvs();
    // A charge more than a week later deletes the old rows (at most once an hour per process: a fresh hour here).
    await chargeContractTime(OTHER, 1, new Date("2031-03-20T10:00:00.000Z"));
    const days = await prisma.$queryRaw<{ day: Date }[]>`SELECT "day" FROM "ContractTime" WHERE "organizationId" = ${OTHER} ORDER BY "day"`;
    expect(days.map((d) => d.day.toISOString().slice(0, 10))).toEqual(["2031-03-20"]);
  });

  /*
   * Consolidated review round 2: the gate is per process and a Fluid
   * deployment runs several, so a check that only read the row let each
   * instance admit its own one running and three waiting for an organisation
   * already at its cap (measured: 12 jobs past the cap on 3 processes). Each
   * job now reserves its deadline in the statement that checks the row.
   */
  it("the allowance holds across instances: a job reserves its deadline before it is queued and settles to its wall time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY", "40");
    await prisma.$executeRaw`DELETE FROM "ContractTime" WHERE "organizationId" = ${OTHER}`;
    await chargeContractTime(OTHER, 39_999);
    const job: Job = { kind: "record", input: { description: BUSINESS_PARTNER, entitySet: "A_Partner", previous: [], unchangedHashes: [] } };
    // Six at once: before, four ran here (one running, three waiting) and two were BUSY. Now one
    // runs, and the other five, refused while it holds the rest of the day, are BUSY (round 3).
    const results = await Promise.all(Array.from({ length: 6 }, () => runJobInEnvelope(job, { tenant: OTHER })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.reason)).toEqual(Array(5).fill("BUSY"));
    // Settled to the one job's wall time: the day's total is under the allowance plus one deadline.
    const after = await msToday(OTHER);
    expect(after).toBeGreaterThan(39_999);
    expect(after).toBeLessThan(39_999 + CONTRACT_JOB_LIMITS.deadlineMs);
    expect(await reservedToday(OTHER)).toBe(0);
    // The day now spent: another instance asks the same row, and is refused until 00:00 UTC.
    expect(await Promise.all([reserveContractTime(OTHER, 10_000), reserveContractTime(OTHER, 10_000)])).toEqual([
      expect.objectContaining({ ok: false, retryAfterMs: expect.any(Number) }),
      expect.objectContaining({ ok: false, retryAfterMs: expect.any(Number) }),
    ]);
    // Concurrent reservations under the allowance: admitted one at a time, none past it.
    await prisma.$executeRaw`DELETE FROM "ContractTime" WHERE "organizationId" = ${OTHER}`;
    const reserved = await Promise.all(Array.from({ length: 8 }, () => reserveContractTime(OTHER, 10_000)));
    expect(reserved.filter((r) => r.ok)).toHaveLength(4);
    expect(await reservedToday(OTHER)).toBe(40_000);
    expect(await msToday(OTHER)).toBe(0);
    // A job that never ran (BUSY: its caller's deadline already passed) gives its reservation back.
    await prisma.$executeRaw`DELETE FROM "ContractTime" WHERE "organizationId" = ${OTHER}`;
    expect(await runJobInEnvelope(job, { tenant: OTHER, deadlineAt: Date.now() - 1 })).toMatchObject({ ok: false, reason: "BUSY" });
    expect(await msToday(OTHER)).toBe(0);
    expect(await reservedToday(OTHER)).toBe(0);
    vi.unstubAllEnvs();
  });

  /*
   * Consolidated review round 3: reservations went into the same column as
   * the settled time, so an organisation with time left was refused
   * ALLOWANCE (retry at 00:00 UTC, and "SAP was not asked" on a verify) while
   * its own jobs were in flight. In flight is BUSY; only settled time spends
   * the day.
   */
  it("jobs in flight are not time spent: BUSY for seconds, never the day's refusal, and the verify's check reads settled time only", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY", "40");
    await prisma.$executeRaw`DELETE FROM "ContractTime" WHERE "organizationId" = ${OTHER}`;
    // Settled 30.5 s and one job in flight: the next is BUSY, and the verify's pre-SAP check still admits.
    await chargeContractTime(OTHER, 30_500);
    const inFlight = await reserveContractTime(OTHER, 10_000);
    expect(inFlight).toMatchObject({ ok: true });
    expect(await reserveContractTime(OTHER, 10_000)).toEqual({ ok: false, inFlight: true });
    expect(await checkContractTime(OTHER)).toEqual({ ok: true });
    expect(await contractJobAdmission("record", OTHER)).toBeNull();
    const job: Job = { kind: "record", input: { description: BUSINESS_PARTNER, entitySet: "A_Partner", previous: [], unchangedHashes: [] } };
    const busy = await runJobInEnvelope(job, { tenant: OTHER });
    expect(busy).toMatchObject({ ok: false, reason: "BUSY" });
    expect(busy).not.toHaveProperty("retryAfterMs");
    // The job in flight settles (it ran 1 s): its reservation is given back, and the next job runs.
    if (inFlight.ok) await chargeContractTime(OTHER, 1_000, inFlight.reservation.at, inFlight.reservation.ms);
    expect(await reservedToday(OTHER)).toBe(0);
    expect(await msToday(OTHER)).toBe(31_500);
    expect(await runJobInEnvelope(job, { tenant: OTHER })).toMatchObject({ ok: true });
    // Four jobs in flight at 0 s: a fifth is BUSY, not ALLOWANCE.
    await prisma.$executeRaw`DELETE FROM "ContractTime" WHERE "organizationId" = ${OTHER}`;
    for (let i = 0; i < 4; i++) expect(await reserveContractTime(OTHER, 10_000)).toMatchObject({ ok: true });
    expect(await runJobInEnvelope(job, { tenant: OTHER })).toMatchObject({ ok: false, reason: "BUSY" });
    expect(await checkContractTime(OTHER)).toEqual({ ok: true });
    await prisma.$executeRaw`DELETE FROM "ContractTime" WHERE "organizationId" = ${OTHER}`;
    vi.unstubAllEnvs();
  });

  it("every job is charged its wall time, a killed one and a download included", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = await msToday(ORG);
    const startedAt = Date.now();
    const r = await runJobInEnvelope(
      { kind: "record", input: { description: wideDescription(20_000), entitySet: "EmpJob", previous: [], unchangedHashes: [] } },
      { tenant: ORG, limits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 32, stackSizeMb: 4, deadlineMs: 300 } },
    );
    const took = Date.now() - startedAt;
    expect(r).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT", cause: "deadline" });
    const charged = (await msToday(ORG)) - before;
    // From spawn to exit: at least the deadline, never more than the whole call took.
    expect(charged).toBeGreaterThanOrEqual(300);
    expect(charged).toBeLessThanOrEqual(took);

    // A starter kit download is a job of the downloading organisation's.
    const iface = await newInterface("kit");
    const kitBefore = await msToday(ORG);
    const kit = await scaffold(new NextRequest(`http://localhost/api/studio/interfaces/${iface.id}/scaffold`), { params: Promise.resolve({ id: iface.id }) });
    expect(kit.status).toBe(200);
    expect(await msToday(ORG)).toBeGreaterThan(kitBefore);
    // Its time spent: 429 until 00:00 UTC.
    vi.stubEnv("COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY", "1");
    await chargeContractTime(ORG, 1_000);
    const refused = await scaffold(new NextRequest(`http://localhost/api/studio/interfaces/${iface.id}/scaffold`), { params: Promise.resolve({ id: iface.id }) });
    vi.unstubAllEnvs();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeLessThanOrEqual(86_400);
  });

  /*
   * Consolidated review round 2: a deploy that bumps SCHEMA_TEXTS_VERSION (or
   * an Instant Rollback across one) left every interface's /schema
   * NOT_RENDERED until each was re-verified against its live SAP system. The
   * texts are a pure function of the stored row, so the build re-renders them
   * from it (scripts/rerender-schema-texts.ts).
   */
  it("after a renderer-version change the stored rows are re-rendered from their own IR, byte for byte, never over a newer render", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const iface = await newInterface("rerender", { operation: "CREATE", mode: "WRITE" });
    const entitySet = iface.entitySet!;
    const record = async (description: string) => {
      const heads = await snapshots.loadRecordHeads(scope, iface, "DEV");
      const job = await runJobInEnvelope({ kind: "record", input: { description, entitySet, ...heads } }, { tenant: ORG });
      const compiled: CompiledService = job.ok ? job.value : { ok: false, reason: job.reason, detail: job.detail };
      return recordVerifiedContract({ scope, iface: { ...iface, entitySet }, compiled, heads, environment: "DEV", connectionId: "conn_dev", actorId: "u_r5" });
    };
    expect(await record(wideDescription(40))).toMatchObject({ status: "RECORDED" });
    expect(await record(wideDescription(40, "Other"))).toMatchObject({ status: "RECORDED", semver: "2.0.0" });
    type Texts = { id: string; schemasText: string | null; createBodyText: string | null; updateBodyText: string | null; schemaTextsVersion: number | null };
    const rows = async () =>
      prisma.contractSnapshot.findMany({
        where: { organizationId: ORG, interfaceId: iface.id },
        orderBy: { semverMajor: "asc" },
        select: { id: true, schemasText: true, createBodyText: true, updateBodyText: true, schemaTextsVersion: true },
      }) as Promise<Texts[]>;
    const [older, current] = await rows();
    expect(older!.schemasText).toBeNull();
    expect(current!.schemasText).not.toBeNull();
    const rendered = { ...current! };

    // Texts of an older renderer version (a bump): rendered again, the same bytes.
    await prisma.$executeRaw`UPDATE "ContractSnapshot" SET "schemaTextsVersion" = ${SCHEMA_TEXTS_VERSION - 1} WHERE "id" = ${current!.id}`;
    const outcome = await rerenderSchemaTexts({ organizationId: ORG });
    expect(outcome.rendered).toBeGreaterThanOrEqual(1);
    expect((await rows())[1]).toEqual(rendered);
    // A newer version's (an old deployment's run, after a rollback): never downgraded (round 3).
    await prisma.$executeRaw`UPDATE "ContractSnapshot" SET "schemaTextsVersion" = ${SCHEMA_TEXTS_VERSION + 1} WHERE "id" = ${current!.id}`;
    await rerenderSchemaTexts({ organizationId: ORG });
    expect((await rows())[1]).toEqual({ ...rendered, schemaTextsVersion: SCHEMA_TEXTS_VERSION + 1 });
    await prisma.$executeRaw`UPDATE "ContractSnapshot" SET "schemaTextsVersion" = ${SCHEMA_TEXTS_VERSION} WHERE "id" = ${current!.id}`;
    // Nothing to do: nothing written.
    const again = await rerenderSchemaTexts({ organizationId: ORG });
    expect((await rows())[1]).toEqual(rendered);
    expect(again.rendered).toBe(0);

    // Another row of the interface holds texts (a verify wrote them meanwhile, or the interface was pointed back): never overwritten.
    await prisma.$executeRaw`UPDATE "ContractSnapshot" SET "schemaTextsVersion" = ${SCHEMA_TEXTS_VERSION - 1} WHERE "id" = ${current!.id}`;
    await prisma.$executeRaw`UPDATE "ContractSnapshot" SET "schemasText" = '{}', "schemaTextsVersion" = ${SCHEMA_TEXTS_VERSION} WHERE "id" = ${older!.id}`;
    await rerenderSchemaTexts({ organizationId: ORG });
    expect((await rows())[1]!.schemaTextsVersion).toBe(SCHEMA_TEXTS_VERSION - 1);
    await prisma.$executeRaw`UPDATE "ContractSnapshot" SET "schemasText" = NULL, "schemaTextsVersion" = NULL WHERE "id" = ${older!.id}`;

    // Its own deadline: past it, the rest are left for the next run, and nothing is written.
    const late = await rerenderSchemaTexts({ deadlineAt: Date.now() - 1, organizationId: ORG });
    expect(late).toMatchObject({ rendered: 0 });
    expect(late.left).toBeGreaterThanOrEqual(1);
    expect((await rows())[1]!.schemaTextsVersion).toBe(SCHEMA_TEXTS_VERSION - 1);
    // A run within it puts the row back; no organisation was charged for it.
    const before = await msToday(ORG);
    await rerenderSchemaTexts({ organizationId: ORG });
    expect((await rows())[1]).toEqual(rendered);
    expect(await msToday(ORG)).toBe(before);
  });
  /*
   * Consolidated review round 3: the build's re-render took the rows in
   * organisation order and stopped at its budget, and /schema served texts
   * only at the running version, so one organisation with a few hundred
   * interfaces left every organisation sorted after it NOT_RENDERED after a
   * deploy. The rows are now taken in turn across organisations, and a row
   * the run does not reach keeps serving its previous render.
   */
  it("the re-render takes organisations in turn, and a row it does not reach still serves its previous texts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A recorded contract and its texts, copied to 30 interfaces of ORG (A) and one of OTHER (B), all an older render.
    const model = await newInterface("rr-model");
    const heads = await snapshots.loadRecordHeads(scope, model, "DEV");
    const job = await runJobInEnvelope({ kind: "record", input: { description: wideDescription(10), entitySet: model.entitySet!, ...heads } }, { tenant: null });
    const compiled: CompiledService = job.ok ? job.value : { ok: false, reason: job.reason, detail: job.detail };
    expect(await recordVerifiedContract({ scope, iface: { ...model, entitySet: model.entitySet! }, compiled, heads, environment: "DEV", connectionId: "conn_dev", actorId: "u_r5" })).toMatchObject({ status: "RECORDED" });
    const otherSolution = await prisma.solution.create({
      data: { organizationId: OTHER, name: "Round 3", slug: `${RUN}-other-app`, classification: "CLIENT_APP", businessProblem: "Round 3.", dataClass: "INTERNAL", status: "ACTIVE" },
      select: { id: true },
    });
    const ifaceOf = (organizationId: string, id: string, sol: string) => ({
      id,
      organizationId,
      solutionId: sol,
      name: id,
      sapProduct: "s4hana",
      externalId: model.externalId,
      operation: "READ",
      mode: "READ",
      entitySet: model.entitySet,
    });
    const aIds = Array.from({ length: 30 }, (_, i) => `${RUN}-rr-a-${String(i).padStart(2, "0")}`);
    const bId = `${RUN}-rr-b-00`;
    await prisma.interface.createMany({ data: [...aIds.map((id) => ifaceOf(ORG, id, solutionId)), ifaceOf(OTHER, bId, otherSolution.id)] });
    const [src] = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ContractSnapshot" WHERE "organizationId" = ${ORG} AND "interfaceId" = ${model.id} AND "schemasText" IS NOT NULL`;
    for (const [organizationId, interfaceId] of [...aIds.map((id) => [ORG, id] as const), [OTHER, bId] as const]) {
      await prisma.$executeRaw`
        INSERT INTO "ContractSnapshot" ("id", "organizationId", "interfaceId", "interfaceVersion", "externalId", "entitySet", "source", "odataVersion",
          "semver", "semverMajor", "semverMinor", "semverPatch", "contentHash", "ir", "irVersion", "irBytes", "diff",
          "schemasText", "createBodyText", "updateBodyText", "schemaTextsVersion", "createdAt")
        SELECT ${`${interfaceId}-snap`}, ${organizationId}, ${interfaceId}, 1, "externalId", "entitySet", "source", "odataVersion",
          "semver", "semverMajor", "semverMinor", "semverPatch", "contentHash", "ir", "irVersion", "irBytes", NULL,
          "schemasText", "createBodyText", "updateBodyText", ${SCHEMA_TEXTS_VERSION - 1}, now()
        FROM "ContractSnapshot" WHERE "id" = ${src!.id}`;
    }
    // The run's clock jumps past its deadline once B's row has been rendered (or after three of A's, which
    // organisation order would reach first): whatever the machine's speed, the run renders a known prefix.
    const realNow = Date.now.bind(Date);
    let jump = 0;
    const read: string[] = [];
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + jump);
    counter.onQuery = (query, params) => {
      if (!query.includes('"ir"::text')) return;
      const org = params.includes(`"${OTHER}"`) ? "B" : params.includes(`"${ORG}"`) ? "A" : "?";
      if (read.includes("B") || read.filter((o) => o === "A").length >= 3) jump = 3_600_000;
      read.push(org);
    };
    let outcome;
    try {
      outcome = await rerenderSchemaTexts({ deadlineAt: realNow() + 600_000 });
    } finally {
      counter.onQuery = null;
      vi.mocked(Date.now).mockRestore();
    }
    // B's one row came before A's second: in turn, not in organisation order.
    const secondA = read.indexOf("A", read.indexOf("A") + 1);
    expect(read.indexOf("B"), read.join(",")).toBeGreaterThanOrEqual(0);
    expect(secondA === -1 || read.indexOf("B") < secondA, read.join(",")).toBe(true);
    expect(outcome.left).toBeGreaterThanOrEqual(25);
    const version = async (organizationId: string, id: string) =>
      (await prisma.contractSnapshot.findFirst({ where: { organizationId, interfaceId: id }, select: { schemaTextsVersion: true } }))?.schemaTextsVersion;
    expect(await version(OTHER, bId)).toBe(SCHEMA_TEXTS_VERSION);
    // A's rows the run did not reach still serve their previous texts: never NOT_RENDERED for a version.
    const left = aIds.at(-1)!;
    expect(await version(ORG, left)).toBe(SCHEMA_TEXTS_VERSION - 1);
    const summaries = await snapshots.currentSnapshotSummaries(scope, [{ id: left, externalId: model.externalId, entitySet: model.entitySet }]);
    expect(summaries.get(left)?.schemasBytes).toBeGreaterThan(0);
    const texts = await snapshots.snapshotSchemaTexts(scope, `${left}-snap`, null);
    expect(texts?.schemas).toBeTruthy();
    await prisma.contractSnapshot.deleteMany({ where: { organizationId: { in: [ORG, OTHER] }, interfaceId: { in: [...aIds, bId] } } });
  });
});
