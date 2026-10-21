// @vitest-environment node
/**
 * STRUCTURAL HARDENING, ROUND 5 (P1.3), against real PostgreSQL. Not another
 * expensive shape: the request thread's work around the envelope, each
 * bounded by construction whatever the input —
 *
 *   one statement     a document's current snapshots are one DISTINCT ON,
 *                     however many interfaces it carries, never one query
 *                     each (1,016 queries filled the pool and blocked the
 *                     thread for 230-610 ms);
 *   what is rendered  a document's grants are only the granting, live rows,
 *                     distinct — never every grant request ever filed;
 *   text, both ways   stored JSON is written from its text (json-text.ts):
 *                     a fixture at its bound, and a recorded 2 MiB contract
 *                     with its diff, cross back from the worker and into
 *                     PostgreSQL as strings, never as object graphs that
 *                     Prisma walks on the request thread.
 *
 * Opt-in on TEST_DATABASE_URL; rows are namespaced and removed.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 180_000 });

/** Every statement the app's client sends, counted (the base client's query events). */
const counter = vi.hoisted(() => ({ queries: 0 }));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
    log: [{ emit: "event", level: "query" }],
  });
  base.$on("query", () => {
    counter.queries += 1;
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u_r5", email: "dev@abeam.com", role: "consultant", organizationId: ORG, authMethod: "session" }),
}));
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: vi.fn() }));

import { POST as captureFixture } from "@/app/api/studio/interfaces/[id]/capture-fixture/route";
import { LIMITS } from "@/lib/contracts/budget";
import { compileContract } from "@/lib/contracts/compile";
import { planDocInputs } from "@/lib/contracts/doc-inputs";
import { compileInEnvelope } from "@/lib/contracts/envelope";
import { isJsonTextRef } from "@/lib/contracts/render-input";
import { recordVerifiedContract } from "@/lib/contracts/record";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import * as snapshots from "@/lib/contracts/snapshot";
import { prisma } from "@/lib/db/prisma";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const RUN = `r5-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const OTHER = `${RUN}-other`;
const scope = tenantScopeOf(ORG);
let solutionId = "";

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

describe.skipIf(!process.env.TEST_DATABASE_URL)("structural hardening round 5, against real PostgreSQL", () => {
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
    await prisma.apiAccessGrant.deleteMany({ where: { organizationId: ORG } });
    await prisma.mockFixture.deleteMany({ where: { organizationId: ORG } });
    await prisma.contractSnapshot.deleteMany({ where: { organizationId: { in: [ORG, OTHER] } } });
    await prisma.interface.deleteMany({ where: { organizationId: ORG } });
    await prisma.solution.deleteMany({ where: { organizationId: ORG } });
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
    const post = () =>
      captureFixture(
        new NextRequest(`http://localhost/api/studio/interfaces/${iface.id}/capture-fixture`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: bodyText,
        }),
        { params: Promise.resolve({ id: iface.id }) },
      );
    // Created, then replaced: both writes.
    for (const replaced of [false, true]) {
      const r = await longestStall(post);
      expect(r.value.status).toBe(200);
      expect(((await r.value.json()) as { data: { replaced: boolean; rows: number } }).data).toMatchObject({ replaced, rows: 25 });
      // Before: Prisma serialised the 2.3 million nodes on this thread — 1.4-1.7 s.
      expect(r.ms).toBeLessThan(600);
    }
    const stored = await prisma.mockFixture.findMany({ where: { organizationId: ORG, interfaceId: iface.id }, select: { body: true, scenario: true } });
    expect(stored).toHaveLength(1);
    const body = stored[0]!.body as { records: { a: number[] }[] };
    expect(body.records).toHaveLength(25);
    expect(body.records[24]!.a[91_999]).toBe(91_999 % 10);
  });

  it("a recorded 1.9 MB contract crosses back and is stored as its text: the event loop keeps ticking", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const iface = await newInterface("recorded", { operation: "CREATE", mode: "WRITE" });
    const record = async (description: string) => {
      const compiled = await longestStall(() => compileInEnvelope(description, "EmpJob", null, ORG));
      const recorded = await longestStall(() =>
        recordVerifiedContract({
          scope,
          iface: { ...iface, entitySet: iface.entitySet },
          compiled: compiled.value,
          environment: "DEV",
          connectionId: "conn_dev",
          actorId: "u_r5",
        }),
      );
      return { compiled, recorded };
    };
    const first = await record(wideDescription(13_000));
    expect(first.recorded.value).toMatchObject({ status: "RECORDED", semver: "1.0.0" });
    const c = first.compiled.value;
    if (!c.ok || !c.dataset?.ok) throw new Error("not compiled");
    expect(c.dataset.bytes).toBeGreaterThan(1_800_000);
    // What crossed back from the worker is the contract's text, never its object graph.
    expect(isJsonTextRef(c.dataset.contract)).toBe(true);
    expect(c.dataset.facts).toMatchObject({ source: "METADATA", odataVersion: "V2", bodies: { create: false, update: true } });

    // Another contract: a new version, its diff run in the envelope and stored as its text.
    const second = await record(wideDescription(13_000, "Other"));
    expect(second.recorded.value).toMatchObject({ status: "RECORDED", semver: "2.0.0", bump: "major" });
    // Before: the reply rebuilt node by node here (50-170 ms) and Prisma's serialisation of the IR (110-280 ms).
    expect(second.compiled.ms).toBeLessThan(150);
    expect(second.recorded.ms).toBeLessThan(150);

    const rows = await prisma.contractSnapshot.findMany({
      where: { organizationId: ORG, interfaceId: iface.id },
      orderBy: { semverMajor: "asc" },
      select: { id: true, ir: true, diff: true, irBytes: true, source: true, odataVersion: true, irVersion: true },
    });
    expect(rows).toHaveLength(2);
    const ir = rows[1]!.ir as { entityType: { properties: { name: string }[] }; source: string };
    expect(ir.entityType.properties).toHaveLength(13_000);
    expect(ir.entityType.properties[0]!.name).toBe("Other0");
    expect(rows[1]).toMatchObject({ source: "METADATA", odataVersion: "V2", irVersion: 1 });
    expect((rows[1]!.diff as { bump: string; changes: unknown[] }).bump).toBe("major");
    expect(rows[0]!.diff).toBeNull();
    // The write's body is decided from the two capabilities, read in the database.
    expect(await snapshots.snapshotBodies(scope, rows[1]!.id)).toEqual({ create: false, update: true });
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
      expect(await snapshots.snapshotBodies(scope, row.id)).toEqual(expected);
    }
    expect(await snapshots.snapshotBodies(tenantScopeOf(OTHER), "nope")).toBeNull();
  });
});
