// @vitest-environment node
/**
 * ContractSnapshot against real PostgreSQL, through the tenant guard (P1.3):
 *
 *   - the first compile is 1.0.0; the same contract again records nothing;
 *     an added optional field is 1.1.0; a removed one 2.0.0 — each a new,
 *     immutable row with its diff;
 *   - environments out of step (DEV ahead of PROD) record each contract once,
 *     however the verifies alternate; an environment going back is a version;
 *   - a contract too large to read back on every call is never stored;
 *   - the current snapshot is the newest describing the interface's service
 *     and dataset NOW: repointing the interface leaves none current;
 *   - two compiles at once never corrupt the line: one records, the other
 *     records too or asks for the verify again;
 *   - a sampled capture never pushes a compiled contract aside;
 *   - the /schema texts live on exactly one row of an interface: the one
 *     /schema serves; an UNCHANGED verify re-attaches them;
 *   - another organization sees none of it, and the guard refuses a query
 *     that names no organization.
 *
 * Opt-in on TEST_DATABASE_URL; rows are namespaced and removed.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The record job is run in process here (jobs.ts is pure), with the heads a
// verify would load (loadRecordHeads); the worker it runs in is covered by
// tests/unit/contracts/containment.test.ts and gate.test.ts.
vi.setConfig({ testTimeout: 60_000 });

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { LIMITS } from "@/lib/contracts/budget";
import { contractDigest } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import { summarizeDatasets } from "@/lib/contracts/datasets";
import { MAX_STORED_CHANGES, MAX_STORED_DIFF_BYTES } from "@/lib/contracts/diff";
import { loadDocInputs } from "@/lib/contracts/doc-inputs";
import { runJobInEnvelope } from "@/lib/contracts/envelope";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { captureJob, recordableContract, recordJob, type CompiledService } from "@/lib/contracts/jobs";
import { standaloneSchemas } from "@/lib/contracts/json-schema";
import { idsWithRequestSchema, recordCapture, recordVerifiedContract } from "@/lib/contracts/record";
import { currentRequestSchemaStamp, requestSchemaText } from "@/lib/contracts/request-schema";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import {
  currentContractSnapshot,
  currentSnapshotSummaries,
  loadRecordHeads,
  recordContractSnapshot,
  snapshotSchemaTexts,
  type RecordOutcome,
} from "@/lib/contracts/snapshot";
import { MissingTenantScopeError } from "@/lib/db/tenant-guard";
import { prisma } from "@/lib/db/prisma";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const RUN = `p13-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const OTHER = `${RUN}-other`;
const scope = tenantScopeOf(ORG);

function salesOrder(): InterfaceContract {
  const r = compileContract(
    readFileSync(path.resolve(__dirname, "../fixtures/contracts/edmx/sales-order-rap.v4.xml"), "utf8"),
  );
  if (!r.ok) throw new Error(r.detail);
  const s = sliceForEntitySet(r.ir, "SalesOrder");
  if (!s.ok) throw new Error(s.detail);
  return s.contract;
}

/**
 * Record a contract as a verify does: the heads loaded for its environment,
 * the contract made ready to record against them (in process: jobs.ts is
 * pure), and the record written. TOO_LARGE when the job refuses its size.
 */
async function record(input: {
  scope: typeof scope;
  iface: { id: string; version: number; externalId: string; entitySet: string };
  contract: InterfaceContract;
  environment?: string | null;
  connectionId?: string;
}): Promise<RecordOutcome | { status: "TOO_LARGE" }> {
  const heads = await loadRecordHeads(input.scope, input.iface, input.environment ?? null);
  const prepared = recordableContract(input.contract, undefined, input.iface.entitySet, heads);
  if (!prepared.ok) return { status: "TOO_LARGE" };
  return recordContractSnapshot({ ...input, contract: prepared, heads });
}

/** What a verify's record job answers for a description (or a contract), with the heads it was diffed against. */
async function compiledFor(
  iface: { id: string; externalId: string; entitySet: string },
  environment: string,
  source: string | InterfaceContract,
): Promise<{ compiled: CompiledService; heads: { ids: string[] } }> {
  const heads = await loadRecordHeads(scope, iface, environment);
  if (typeof source === "string") return { compiled: recordJob({ description: source, entitySet: iface.entitySet, ...heads }), heads };
  const dataset = recordableContract(source, undefined, iface.entitySet, heads);
  return {
    compiled: { ok: true, format: "xml", odataVersion: source.odataVersion, datasets: summarizeDatasets([iface.entitySet], iface.entitySet), sourceLength: 0, dataset },
    heads,
  };
}

/** The ids of an interface's rows that hold the /schema texts. */
async function rowsWithTexts(interfaceId: string): Promise<string[]> {
  const rows = await prisma.contractSnapshot.findMany({
    where: { organizationId: ORG, interfaceId, schemasText: { not: null } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

let solutionId = "";
async function newInterface(name: string): Promise<{ id: string; version: number; externalId: string; entitySet: string }> {
  const row = await prisma.interface.create({
    data: {
      organizationId: ORG,
      solutionId,
      name,
      sapProduct: "s4hana",
      externalId: "CE_SALESORDER_0001",
      operation: "READ",
      mode: "READ",
      entitySet: "SalesOrder",
    },
    select: { id: true, version: true, externalId: true, entitySet: true },
  });
  return { ...row, entitySet: row.entitySet! };
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("ContractSnapshot, against real PostgreSQL", () => {
  beforeAll(async () => {
    for (const id of [ORG, OTHER]) await prisma.organization.create({ data: { id, name: `P1.3 ${id}`, type: "client" } });
    const s = await prisma.solution.create({
      data: {
        organizationId: ORG,
        name: "Order portal",
        slug: `${RUN}-app`,
        classification: "CLIENT_APP",
        businessProblem: "Snapshot test.",
        dataClass: "INTERNAL",
        status: "ACTIVE",
        technicalOwnerId: `${RUN}-dana`,
        businessOwnerId: `${RUN}-dana`,
        supportOwnerId: `${RUN}-dana`,
      },
      select: { id: true },
    });
    solutionId = s.id;
  });

  afterAll(async () => {
    await prisma.contractSnapshot.deleteMany({ where: { organizationId: ORG } });
    await prisma.interface.deleteMany({ where: { organizationId: ORG } });
    await prisma.solution.deleteMany({ where: { organizationId: ORG } });
    for (const id of [ORG, OTHER]) await prisma.organization.delete({ where: { id } });
    await prisma.$disconnect();
  });

  it("records 1.0.0, nothing for the same contract, then minor and major versions", async () => {
    const iface = await newInterface("versions");
    const first = await record({ scope, iface, contract: salesOrder(), environment: "DEV", connectionId: "conn_1" });
    expect(first).toMatchObject({ status: "RECORDED", snapshot: { semver: "1.0.0", source: "METADATA", odataVersion: "V4" }, diff: null });
    if (first.status !== "RECORDED") throw new Error(first.status);

    const again = await record({ scope, iface, contract: salesOrder() });
    expect(again).toMatchObject({ status: "UNCHANGED", snapshot: { id: first.snapshot.id, semver: "1.0.0" } });

    const added = salesOrder();
    added.entityType.properties.push({ name: "Region", type: "Edm.String", nullable: true });
    const minor = await record({ scope, iface, contract: added });
    expect(minor).toMatchObject({ status: "RECORDED", snapshot: { semver: "1.1.0" }, diff: { bump: "minor" } });

    const removed = salesOrder();
    removed.entityType.properties = removed.entityType.properties.filter((p) => p.name !== "ContactEmail");
    const major = await record({ scope, iface, contract: removed });
    expect(major).toMatchObject({ status: "RECORDED", snapshot: { semver: "2.0.0" }, diff: { bump: "major" } });

    const rows = await prisma.contractSnapshot.findMany({
      where: { organizationId: ORG, interfaceId: iface.id },
      orderBy: { createdAt: "asc" },
      select: { semver: true, contentHash: true, environment: true },
    });
    expect(rows.map((r) => r.semver)).toEqual(["1.0.0", "1.1.0", "2.0.0"]);
    expect(new Set(rows.map((r) => r.contentHash)).size).toBe(3);
    expect(rows[0]!.environment).toBe("DEV");

    const current = await currentContractSnapshot(scope, iface);
    expect(current?.semver).toBe("2.0.0");
    expect(current?.contract.entityType.properties.some((p) => p.name === "ContactEmail")).toBe(false);
  });

  it("verifying DEV and PROD in turn records each contract once, whatever the order", async () => {
    // DEV is ahead of PROD by a transport: one more optional field.
    const iface = await newInterface("environments");
    const prod = salesOrder;
    const dev = () => {
      const c = salesOrder();
      c.entityType.properties.push({ name: "ZZ1_NewField", type: "Edm.String", nullable: true });
      return c;
    };
    const seen: string[] = [];
    for (const [environment, contract] of [
      ["PROD", prod],
      ["DEV", dev],
      ["PROD", prod],
      ["DEV", dev],
      ["PROD", prod],
    ] as const) {
      const r = await record({ scope, iface, contract: contract(), environment });
      if (r.status === "TOO_LARGE" || r.status === "REFUSED") throw new Error(r.status);
      seen.push(`${environment}:${r.status}:${r.snapshot.semver}`);
    }
    expect(seen).toEqual(["PROD:RECORDED:1.0.0", "DEV:RECORDED:1.1.0", "PROD:UNCHANGED:1.0.0", "DEV:UNCHANGED:1.1.0", "PROD:UNCHANGED:1.0.0"]);
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(2);

    // PROD catching up to DEV's contract is DEV's version, not a new one.
    const caughtUp = await record({ scope, iface, contract: dev(), environment: "PROD" });
    expect(caughtUp).toMatchObject({ status: "UNCHANGED", snapshot: { semver: "1.1.0" } });

    // Another logon language relabels the same structure: a patch against the nearest contract, then stable.
    // (Relabelling the line's newest contract: TEST relabelling PROD's older
    // one would also drop ZZ1_NewField from the line, which is major.)
    const german = dev();
    german.entityType.properties[0]!.label = "Kundenauftrag";
    const test1 = await record({ scope, iface, contract: german, environment: "TEST" });
    expect(test1).toMatchObject({ status: "RECORDED", snapshot: { semver: "1.1.1" }, diff: { bump: "patch" } });
    const test2 = await record({ scope, iface, contract: german, environment: "TEST" });
    expect(test2).toMatchObject({ status: "UNCHANGED", snapshot: { semver: "1.1.1" } });
    expect(await record({ scope, iface, contract: dev(), environment: "DEV" })).toMatchObject({ status: "UNCHANGED" });
  });

  it("an environment's first verify, nearest another's older row, still follows the line's newest (diffs in the envelope)", async () => {
    // DEV holds 1.0.0, TEST the line's newest (1.1.0, with ZZ1_F2). PROD's
    // first contract restates DEV's with a new label: nearest DEV (a patch),
    // but it lacks the line's ZZ1_F2, so on the line it is a major.
    const iface = await newInterface("first-verify-line");
    const relabelled = () => {
      const c = salesOrder();
      c.entityType.properties[0]!.label = "Relabelled";
      return c;
    };
    const withF2 = () => {
      const c = salesOrder();
      c.entityType.properties.push({ name: "ZZ1_F2", type: "Edm.String", nullable: true });
      return c;
    };
    const seen: string[] = [];
    for (const [environment, contract] of [
      ["DEV", salesOrder],
      ["TEST", withF2],
      ["PROD", relabelled],
    ] as const) {
      const r = await record({ scope, iface, contract: contract(), environment });
      if (r.status === "TOO_LARGE" || r.status === "REFUSED") throw new Error(r.status);
      seen.push(`${environment}:${r.status}:${r.snapshot.semver}${r.status === "RECORDED" && r.diff ? `:${r.diff.bump}` : ""}`);
    }
    expect(seen).toEqual(["DEV:RECORDED:1.0.0", "TEST:RECORDED:1.1.0:minor", "PROD:RECORDED:2.0.0:major"]);
  });

  it("a version never drops a field the version before it on the line had, without a major bump", async () => {
    // PROD's own newest row is older than the line's newest, which another
    // environment recorded and PROD has since caught up to. Diffed only
    // against PROD's own row, D was "one field added" (minor), and the line
    // went 1.1.0 (with ZZ1_F2) → 1.2.0 (without it).
    const iface = await newInterface("line");
    const A = salesOrder;
    const withField = (name: string) => () => {
      const c = salesOrder();
      c.entityType.properties.push({ name, type: "Edm.String", nullable: true });
      return c;
    };
    const B = withField("ZZ1_F2");
    const D = withField("ZZ1_F3");
    const seen: string[] = [];
    for (const [environment, contract] of [
      ["PROD", A],
      ["DEV", B],
      ["PROD", B],
      ["PROD", D],
      ["DEV", D],
    ] as const) {
      const r = await record({ scope, iface, contract: contract(), environment });
      if (r.status === "TOO_LARGE" || r.status === "REFUSED") throw new Error(r.status);
      seen.push(`${environment}:${r.status}:${r.snapshot.semver}${r.status === "RECORDED" && r.diff ? `:${r.diff.bump}` : ""}`);
    }
    expect(seen).toEqual([
      "PROD:RECORDED:1.0.0",
      "DEV:RECORDED:1.1.0:minor",
      "PROD:UNCHANGED:1.1.0",
      "PROD:RECORDED:2.0.0:major",
      "DEV:UNCHANGED:2.0.0",
    ]);
    const rows = await prisma.contractSnapshot.findMany({
      where: { organizationId: ORG, interfaceId: iface.id },
      orderBy: [{ semverMajor: "asc" }, { semverMinor: "asc" }, { semverPatch: "asc" }],
      select: { semver: true, ir: true, diff: true },
    });
    const names = (ir: unknown) => new Set((ir as InterfaceContract).entityType.properties.map((p) => p.name));
    for (let i = 1; i < rows.length; i++) {
      const [before, after] = [names(rows[i - 1]!.ir), names(rows[i]!.ir)];
      const lost = [...before].some((n) => !after.has(n));
      if (lost) expect(rows[i]!.semver.split(".")[0]).not.toBe(rows[i - 1]!.semver.split(".")[0]);
    }
    // The recorded diff says what the line lost.
    expect(JSON.stringify(rows.at(-1)!.diff)).toContain("ZZ1_F2 was removed.");
  });

  it("an environment going back to an older contract of its own is still a new version", async () => {
    const iface = await newInterface("revert");
    const added = salesOrder();
    added.entityType.properties.push({ name: "Region", type: "Edm.String", nullable: true });
    await record({ scope, iface, contract: salesOrder(), environment: "DEV" });
    await record({ scope, iface, contract: added, environment: "DEV" });
    const back = await record({ scope, iface, contract: salesOrder(), environment: "DEV" });
    expect(back).toMatchObject({ status: "RECORDED", snapshot: { semver: "2.0.0" }, diff: { bump: "major" } });
    expect((await currentContractSnapshot(scope, iface))?.contract.entityType.properties.some((p) => p.name === "Region")).toBe(false);
  });

  it("never stores a contract too large to read back on every call", async () => {
    const iface = await newInterface("too-large");
    const huge = salesOrder();
    for (let i = 0; i < 60_000; i++) {
      huge.entityType.properties.push({ name: `ZZ1_GENERATED_EXTENSION_FIELD_${i}`, type: "Edm.String", nullable: true, label: "x".repeat(20) });
    }
    const r = await record({ scope, iface, contract: huge, environment: "DEV" });
    expect(r.status).toBe("TOO_LARGE");
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(0);
  });

  it("a description whose dataset folds out of all proportion is reported, not recorded", async () => {
    const iface = await newInterface("fold");
    const n = 2000;
    const doc =
      '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
      '<Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
      `<ComplexType Name="Base">${Array.from({ length: n }, (_, i) => `<Property Name="b${i}" Type="Edm.String"/>`).join("")}</ComplexType>` +
      Array.from({ length: n }, (_, i) => `<ComplexType Name="c${i}" BaseType="ns.Base"/>`).join("") +
      '<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>' +
      Array.from({ length: n }, (_, i) => `<Property Name="p${i}" Type="ns.c${i}"/>`).join("") +
      '</EntityType><EntityContainer Name="C"><EntitySet Name="SalesOrder" EntityType="ns.T"/></EntityContainer>' +
      "</Schema></edmx:DataServices></edmx:Edmx>";
    const outcome = await recordVerifiedContract({
      scope,
      iface: { ...iface, operation: "READ", mode: "READ" },
      ...(await compiledFor(iface, "DEV", doc)),
      environment: "DEV",
      connectionId: "conn_1",
      actorId: "u1",
    });
    expect(outcome).toMatchObject({ status: "NOT_COMPILED" });
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(0);
  });

  it("a contract out of proportion to its description is not recorded, though under the absolute bound (round 3)", async () => {
    // One labelled base type folded into 100 types: 31 KB stored as 1.8 MB, before.
    const iface = await newInterface("proportion");
    const n = 100;
    const doc =
      '<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData">' +
      '<edmx:DataServices m:DataServiceVersion="2.0"><Schema Namespace="ns" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">' +
      `<ComplexType Name="B">${Array.from({ length: n }, (_, i) => `<Property Name="b${i}" Type="Edm.String" sap:label="${`L${i}`.padEnd(120, "l")}"/>`).join("")}</ComplexType>` +
      Array.from({ length: n }, (_, i) => `<ComplexType Name="c${i}" BaseType="ns.B"/>`).join("") +
      '<EntityType Name="T"><Key><PropertyRef Name="k"/></Key><Property Name="k" Type="Edm.String" Nullable="false"/>' +
      Array.from({ length: n }, (_, i) => `<Property Name="p${i}" Type="ns.c${i}"/>`).join("") +
      '</EntityType><EntityContainer Name="C" m:IsDefaultEntityContainer="true"><EntitySet Name="SalesOrder" EntityType="ns.T"/></EntityContainer>' +
      "</Schema></edmx:DataServices></edmx:Edmx>";
    const outcome = await recordVerifiedContract({
      scope,
      iface: { ...iface, operation: "READ", mode: "READ" },
      ...(await compiledFor(iface, "DEV", doc)),
      environment: "DEV",
      connectionId: "conn_1",
      actorId: "u1",
    });
    expect(outcome).toMatchObject({ status: "NOT_COMPILED" });
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(0);
  });

  it.each([
    ["U+0000", "p\u0000"],
    ["an unpaired surrogate", "p\ud800"],
  ])("a property named with %s is refused at compile, never a snapshot PostgreSQL cannot store (round 3)", async (_label, bad) => {
    const iface = await newInterface(`unstorable-${bad.length}-${bad.charCodeAt(1)}`);
    const doc = JSON.stringify({
      $Version: "4.0",
      ns: {
        T: { $Kind: "EntityType", $Key: ["k"], k: {}, [bad]: {} },
        C: { $Kind: "EntityContainer", SalesOrder: { $Collection: true, $Type: "ns.T" } },
      },
    });
    const outcome = await recordVerifiedContract({
      scope,
      iface: { ...iface, operation: "READ", mode: "READ" },
      ...(await compiledFor(iface, "DEV", doc)),
      environment: "DEV",
      connectionId: "conn_1",
      actorId: "u1",
    });
    expect(outcome).toMatchObject({ status: "NOT_COMPILED" });
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(0);
  });

  it("is current only while the interface names the same service and dataset", async () => {
    const iface = await newInterface("repoint");
    await record({ scope, iface, contract: salesOrder() });
    expect(await currentContractSnapshot(scope, iface)).not.toBeNull();
    expect(await currentContractSnapshot(scope, { ...iface, entitySet: "SalesOrderItem" })).toBeNull();
    expect(await currentContractSnapshot(scope, { ...iface, externalId: "custom:/sap/opu/odata4/sap/zx" })).toBeNull();
    expect(await currentContractSnapshot(scope, { ...iface, entitySet: null })).toBeNull();
  });

  it("two compiles at once never corrupt the line", async () => {
    const iface = await newInterface("race");
    await record({ scope, iface, contract: salesOrder() });
    const a = salesOrder();
    a.entityType.properties.push({ name: "A", type: "Edm.String", nullable: true });
    const b = salesOrder();
    b.entityType.properties.push({ name: "B", type: "Edm.String", nullable: true });
    const results = await Promise.all([
      record({ scope, iface, contract: a }),
      record({ scope, iface, contract: b }),
    ]);
    // One records; the other records after it, or — the history having moved since its job diffed — asks to be verified again.
    expect(results.filter((r) => r.status === "RECORDED").length).toBeGreaterThanOrEqual(1);
    for (const r of results) expect(["RECORDED", "REFUSED"]).toContain(r.status);
    const versions = await prisma.contractSnapshot.findMany({
      where: { organizationId: ORG, interfaceId: iface.id },
      select: { semver: true },
    });
    expect(new Set(versions.map((v) => v.semver)).size).toBe(versions.length);
    expect(versions).toHaveLength(1 + results.filter((r) => r.status === "RECORDED").length);
    // And the texts are on the one row /schema serves.
    expect(await rowsWithTexts(iface.id)).toEqual([(await currentContractSnapshot(scope, iface))!.id]);
  });

  it("a sampled capture is the fallback, and never pushes a compiled contract aside", async () => {
    const iface = await newInterface("sampled");
    const rows = [{ SalesOrder: "1", "@odata.etag": "W/1" }];
    /** As capture-schema does: the job, then one transaction (record.ts, recordCapture). */
    const capture = async (declaredVersion: string | null) => {
      const current = (await currentSnapshotSummaries(scope, [iface])).get(iface.id) ?? null;
      const preferred = current?.source === "METADATA" ? { snapshotId: current.id, semver: current.semver } : null;
      const heads = await loadRecordHeads(scope, iface, null);
      const job = captureJob({
        body: JSON.stringify({ rows }),
        capturedAt: "2026-10-21T00:00:00.000Z",
        iface: { version: iface.version, entitySet: iface.entitySet },
        declaredVersion,
        record: preferred === null,
        ...heads,
      });
      if (!job.ok) throw new Error(job.reason);
      return recordCapture({ scope, iface, schema: job.schema, contract: job.contract, preferred, heads, actorId: "u1" });
    };
    const sampled = await capture(null);
    expect(sampled).toMatchObject({ status: "RECORDED", semver: "1.0.0" });
    expect((await currentContractSnapshot(scope, iface))?.source).toBe("SAMPLED");
    // The schema, the SAMPLED snapshot and its texts, together.
    const stored = await prisma.interface.findFirst({ where: { id: iface.id, organizationId: ORG }, select: { responseSchema: true } });
    expect(stored?.responseSchema).toMatchObject({ type: "object", properties: { SalesOrder: { type: "string" } } });
    expect(await rowsWithTexts(iface.id)).toHaveLength(1);

    const compiled = await record({ scope, iface, contract: salesOrder() });
    expect(compiled).toMatchObject({ status: "RECORDED", snapshot: { semver: "1.1.0", source: "METADATA" }, diff: { bump: "minor" } });

    const after = await capture("V4");
    expect(after).toMatchObject({ status: "METADATA_PREFERRED", semver: "1.1.0" });
    expect((await currentContractSnapshot(scope, iface))?.source).toBe("METADATA");
  });

  it("is invisible to another organization, and the guard refuses an unscoped query", async () => {
    const iface = await newInterface("tenant");
    await record({ scope, iface, contract: salesOrder() });
    expect(await currentContractSnapshot(tenantScopeOf(OTHER), iface)).toBeNull();
    await expect(prisma.contractSnapshot.findMany({ where: { interfaceId: iface.id } })).rejects.toBeInstanceOf(
      MissingTenantScopeError,
    );
  });

  /*
   * Hostile-input review round 1. PROD behind DEV: PROD records 1.0.0, DEV
   * 2.0.0 (Region added, mandatory), PROD verifies UNCHANGED against its own
   * 1.0.0 — and wrote 1.0.0's closed create body as requestSchema, beside the
   * 2.0.0 contract /schema serves as current.
   */
  it("a write interface's requestSchema is the current contract's body, whichever environment verified last", async () => {
    const created = await prisma.interface.create({
      data: {
        organizationId: ORG,
        solutionId,
        name: "create",
        sapProduct: "s4hana",
        externalId: "CE_SALESORDER_0001",
        operation: "CREATE",
        mode: "WRITE",
        entitySet: "SalesOrder",
      },
      select: { id: true, version: true, externalId: true, entitySet: true, operation: true, mode: true },
    });
    const iface = { ...created, entitySet: created.entitySet! };
    const rap = readFileSync(path.resolve(__dirname, "../fixtures/contracts/edmx/sales-order-rap.v4.xml"), "utf8");
    const a = () => compileContract(rap);
    const b = () => {
      const r = compileContract(rap);
      if (!r.ok) throw new Error(r.detail);
      const t = r.ir.entityTypes.find((e) => e.name === "SalesOrderType")!;
      t.properties.push({ name: "Region", type: "Edm.String", nullable: true, capabilities: { mandatory: true } });
      return r;
    };
    const verified = async (environment: string, compiled: ReturnType<typeof compileContract>) => {
      if (!compiled.ok) throw new Error(compiled.detail);
      const slice = sliceForEntitySet(compiled.ir, iface.entitySet, compiled.sourceLength);
      if (!slice.ok) throw new Error(slice.detail);
      return recordVerifiedContract({ scope, iface, ...(await compiledFor(iface, environment, slice.contract)), environment, connectionId: `conn_${environment}`, actorId: "u1" });
    };

    expect(await verified("PROD", a())).toMatchObject({ status: "RECORDED", semver: "1.0.0", requestSchemaWritten: true });
    expect(await verified("DEV", b())).toMatchObject({ status: "RECORDED", semver: "2.0.0", bump: "major" });
    expect(await verified("PROD", a())).toMatchObject({ status: "UNCHANGED", semver: "1.0.0", requestSchemaWritten: true });

    const current = await currentContractSnapshot(scope, iface);
    expect(current?.semver).toBe("2.0.0");
    const row = await prisma.interface.findFirst({ where: { id: iface.id, organizationId: ORG }, select: { requestSchema: true, version: true, entitySet: true } });
    // /schema's body: the current snapshot's stored text, spliced with the stamp.
    const stamp = currentRequestSchemaStamp(row!.requestSchema, row!, current!.id);
    expect(stamp).not.toBeNull();
    const texts = await snapshotSchemaTexts(scope, current!.id, "CREATE");
    const served = JSON.parse(requestSchemaText(texts!.body, stamp!)!) as { required: string[]; "x-contract": { semver: string } };
    expect(served!["x-contract"].semver).toBe("2.0.0");
    // The two bodies /schema serves agree: both require Region.
    expect(served!.required).toEqual(standaloneSchemas(current!.contract, "SalesOrder").create!.required);
    expect(served!.required).toContain("Region");
    // A body stamped with any other snapshot is never served.
    expect(currentRequestSchemaStamp(row!.requestSchema, row!, "another-snapshot")).toBeNull();
    // PROD's UNCHANGED verify of the older contract left the texts on the current row.
    expect(await rowsWithTexts(iface.id)).toEqual([current!.id]);
  });

  it("a write interface's row keeps the stamp of its body, never the body (hostile-input review round 2)", async () => {
    // The body is a multiple of the contract (52 MB under the size bound), and
    // every Studio list of the organisation's interfaces read it back.
    const created = await prisma.interface.create({
      data: {
        organizationId: ORG,
        solutionId,
        name: "create-stamp",
        sapProduct: "s4hana",
        externalId: "CE_SALESORDER_0001",
        operation: "CREATE",
        mode: "WRITE",
        entitySet: "SalesOrder",
      },
      select: { id: true, version: true, externalId: true, entitySet: true, operation: true, mode: true },
    });
    const iface = { ...created, entitySet: created.entitySet! };
    const rap = readFileSync(path.resolve(__dirname, "../fixtures/contracts/edmx/sales-order-rap.v4.xml"), "utf8");
    const outcome = await recordVerifiedContract({ scope, iface, ...(await compiledFor(iface, "DEV", rap)), environment: "DEV", connectionId: "conn_DEV", actorId: "u1" });
    expect(outcome).toMatchObject({ status: "RECORDED", requestSchemaWritten: true });
    const row = await prisma.interface.findFirst({ where: { id: iface.id, organizationId: ORG }, select: { requestSchema: true } });
    expect(Object.keys(row!.requestSchema as object)).toEqual(["x-contract"]);
    expect(Buffer.byteLength(JSON.stringify(row!.requestSchema))).toBeLessThan(2048);
    // And a list asks whether there is one without reading it.
    const ids = await idsWithRequestSchema({ organizationId: ORG, solutionId });
    expect(ids.has(iface.id)).toBe(true);
  });

  it("stores a bounded diff and the contract's size, whatever the contract", async () => {
    // 2,000 renamed parameters of an action named with 65,000 characters
    // stored 260 MB of diff (past jsonb's limit) from a 170 KB contract.
    const iface = await newInterface("diff-bound");
    const withAction = (prefix: string) => {
      const c = salesOrder();
      c.operations.push({
        name: "A".repeat(65_000),
        kind: "action",
        bound: true,
        bindingType: c.entityType.qualifiedName,
        parameters: [
          { name: "it", type: c.entityType.qualifiedName, nullable: false },
          ...Array.from({ length: 2000 }, (_, i) => ({ name: `${prefix}${i}`, type: "Edm.String", nullable: false })),
        ],
      });
      return c;
    };
    const first = await record({ scope, iface, contract: withAction("a"), environment: "DEV" });
    const second = await record({ scope, iface, contract: withAction("b"), environment: "DEV" });
    expect(second).toMatchObject({ status: "RECORDED", snapshot: { semver: "2.0.0" }, diff: { bump: "major", omitted: 4000 - MAX_STORED_CHANGES } });
    const rows = await prisma.contractSnapshot.findMany({
      where: { organizationId: ORG, interfaceId: iface.id },
      orderBy: { semverMajor: "asc" },
      select: { diff: true, irBytes: true },
    });
    expect(Buffer.byteLength(JSON.stringify(rows[1]!.diff))).toBeLessThan(MAX_STORED_DIFF_BYTES);
    expect((rows[1]!.diff as { changes: unknown[] }).changes).toHaveLength(MAX_STORED_CHANGES);
    // The size the documents' budget is checked against, kept at record time.
    if (first.status !== "RECORDED") throw new Error(first.status);
    expect(rows[0]!.irBytes).toBe(contractDigest(withAction("a")).bytes);
  });

  it("a document's contracts are added up and refused past the budget, a row without a kept size measured", async () => {
    const one = await newInterface("budget-1");
    const two = await newInterface("budget-2");
    await record({ scope, iface: one, contract: salesOrder() });
    await record({ scope, iface: two, contract: salesOrder() });
    const bytes = contractDigest(salesOrder()).bytes;
    expect((await loadDocInputs(scope, [one, two])).ok).toBe(true);
    expect(await loadDocInputs(scope, [one, two], { maxContractBytes: 2 * bytes - 1 })).toMatchObject({ ok: false, reason: "TOO_LARGE" });
    expect((await loadDocInputs(scope, [one], { maxContractBytes: 2 * bytes - 1 })).ok).toBe(true);
    // A row recorded before the size was kept is measured when read.
    await prisma.contractSnapshot.updateMany({ where: { organizationId: ORG, interfaceId: { in: [one.id, two.id] } }, data: { irBytes: null } });
    expect(await loadDocInputs(scope, [one, two], { maxContractBytes: bytes })).toMatchObject({ ok: false, reason: "TOO_LARGE" });
  });

  it("a record job that does not finish records nothing: the version cannot be chosen without its diff", async () => {
    const iface = await newInterface("diff-refused");
    const first = await record({ scope, iface, contract: salesOrder(), environment: "DEV" });
    expect(first.status).toBe("RECORDED");
    const rap = readFileSync(path.resolve(__dirname, "../fixtures/contracts/edmx/sales-order-rap.v4.xml"), "utf8");
    const heads = await loadRecordHeads(scope, iface, "DEV");
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A deadline shorter than the worker takes to start: the job never finishes.
    const job = await runJobInEnvelope({ kind: "record", input: { description: rap.replace("<Property", '<Property Name="Extra" Type="Edm.String"/><Property'), entitySet: iface.entitySet, ...heads } }, { deadlineAt: Date.now() + 50 });
    expect(job).toMatchObject({ ok: false, reason: "BUSY" });
    const outcome = await recordVerifiedContract({
      scope,
      iface: { ...iface, operation: "READ", mode: "READ" },
      compiled: job.ok ? job.value : { ok: false, reason: job.reason, detail: job.detail },
      heads,
      environment: "DEV",
      connectionId: "conn_1",
      actorId: "u1",
    });
    expect(outcome).toMatchObject({ status: "NOT_COMPILED", retryAfterSeconds: 5 });
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(1);
  });

  it("the /schema texts live on one row: a new version takes them, an UNCHANGED verify re-attaches them, a repointed interface finds none", async () => {
    const iface = await newInterface("texts");
    const first = await record({ scope, iface, contract: salesOrder(), environment: "DEV" });
    if (first.status !== "RECORDED") throw new Error(first.status);
    expect(await rowsWithTexts(iface.id)).toEqual([first.snapshot.id]);
    const added = salesOrder();
    added.entityType.properties.push({ name: "Region", type: "Edm.String", nullable: true });
    const second = await record({ scope, iface, contract: added, environment: "DEV" });
    if (second.status !== "RECORDED") throw new Error(second.status);
    expect(await rowsWithTexts(iface.id)).toEqual([second.snapshot.id]);
    // The texts are what the record job rendered: /schema's schemas, as compact JSON.
    const texts = await snapshotSchemaTexts(scope, second.snapshot.id, "UPDATE");
    expect(texts!.schemas).toBe(JSON.stringify(standaloneSchemas(added, "SalesOrder")));
    expect(texts!.body).toBe(JSON.stringify(standaloneSchemas(added, "SalesOrder").update));
    // Lost (a row from before they were kept), and re-attached by an UNCHANGED verify of the same contract.
    await prisma.$executeRaw`UPDATE "ContractSnapshot" SET "schemasText" = NULL, "createBodyText" = NULL, "updateBodyText" = NULL WHERE "interfaceId" = ${iface.id} AND "organizationId" = ${ORG}`;
    expect((await currentSnapshotSummaries(scope, [iface])).get(iface.id)?.schemasBytes).toBeNull();
    expect(await record({ scope, iface, contract: added, environment: "DEV" })).toMatchObject({ status: "UNCHANGED", snapshot: { id: second.snapshot.id } });
    expect(await rowsWithTexts(iface.id)).toEqual([second.snapshot.id]);
    expect((await currentSnapshotSummaries(scope, [iface])).get(iface.id)?.schemasBytes).toBeGreaterThan(0);
    // Pointed at another dataset and verified there, then back without a verify: the earlier dataset's row has none.
    await prisma.interface.updateMany({ where: { id: iface.id, organizationId: ORG }, data: { entitySet: "SalesOrderItem" } });
    const item = { ...iface, entitySet: "SalesOrderItem" };
    const r = compileContract(readFileSync(path.resolve(__dirname, "../fixtures/contracts/edmx/sales-order-rap.v4.xml"), "utf8"));
    if (!r.ok) throw new Error(r.detail);
    const s = sliceForEntitySet(r.ir, "SalesOrderItem");
    if (!s.ok) throw new Error(s.detail);
    const third = await record({ scope, iface: item, contract: s.contract, environment: "DEV" });
    if (third.status !== "RECORDED") throw new Error(third.status);
    expect(await rowsWithTexts(iface.id)).toEqual([third.snapshot.id]);
    const back = (await currentSnapshotSummaries(scope, [iface])).get(iface.id);
    expect(back).toMatchObject({ id: second.snapshot.id, schemasBytes: null });
  });

  /*
   * Structural hardening round 1: a description flipping between two
   * contracts records a version per verify, by design — and every read
   * loaded every one of them (20,030 rows: half a second a call). The
   * history is now bounded when a row is recorded, each environment's
   * newest kept, and each decision reads the one row it needs.
   */
  it("keeps a bounded history however long the flips went on, each environment's newest kept", async () => {
    const iface = await newInterface("history");
    const first = await record({ scope, iface, contract: salesOrder(), environment: "PROD" });
    if (first.status !== "RECORDED") throw new Error(first.status);
    const base = await prisma.contractSnapshot.findFirstOrThrow({ where: { organizationId: ORG, id: first.snapshot.id } });
    // The history an attacker's flips leave behind: DEV rows, each a version, written directly.
    const flips = LIMITS.snapshotHistory + 40;
    await prisma.contractSnapshot.createMany({
      data: Array.from({ length: flips }, (_, i) => ({
        organizationId: ORG,
        interfaceId: iface.id,
        interfaceVersion: base.interfaceVersion,
        externalId: base.externalId,
        entitySet: base.entitySet,
        source: base.source,
        odataVersion: base.odataVersion,
        semver: `1.${i + 1}.0`,
        semverMajor: 1,
        semverMinor: i + 1,
        semverPatch: 0,
        contentHash: `${RUN}-flip-${i}`,
        ir: base.ir as Prisma.InputJsonObject,
        irVersion: base.irVersion,
        irBytes: base.irBytes,
        environment: "DEV",
      })),
    });

    // The next verify of DEV records one more version, and the history is cut back.
    const added = salesOrder();
    added.entityType.properties.push({ name: "Region", type: "Edm.String", nullable: true });
    const next = await record({ scope, iface, contract: added, environment: "DEV" });
    expect(next).toMatchObject({ status: "RECORDED", snapshot: { semver: `1.${flips + 1}.0` } });
    const kept = await prisma.contractSnapshot.findMany({
      where: { organizationId: ORG, interfaceId: iface.id },
      select: { id: true, semverMinor: true, environment: true },
    });
    // The newest LIMITS.snapshotHistory, and PROD's own newest — the oldest row of all.
    expect(kept).toHaveLength(LIMITS.snapshotHistory + 1);
    expect(kept.some((r) => r.id === first.snapshot.id)).toBe(true);
    expect(Math.min(...kept.filter((r) => r.environment === "DEV").map((r) => r.semverMinor))).toBe(flips + 1 - LIMITS.snapshotHistory + 1);

    // Each decision still reads the right row: the line's newest is current…
    expect((await currentContractSnapshot(scope, iface))?.semver).toBe(`1.${flips + 1}.0`);
    // …and PROD, verifying its own contract again, is its own row, kept.
    expect(await record({ scope, iface, contract: salesOrder(), environment: "PROD" })).toMatchObject({
      status: "UNCHANGED",
      snapshot: { id: first.snapshot.id },
    });
  });

  it("goes with its interface", async () => {
    const iface = await newInterface("cascade");
    await record({ scope, iface, contract: salesOrder() });
    await prisma.interface.delete({ where: { id: iface.id, organizationId: ORG } });
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(0);
  });
});
