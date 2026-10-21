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
 *   - two compiles at once both succeed, as two versions or one;
 *   - a sampled capture never pushes a compiled contract aside;
 *   - another organization sees none of it, and the guard refuses a query
 *     that names no organization.
 *
 * Opt-in on TEST_DATABASE_URL; rows are namespaced and removed.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { compileContract } from "@/lib/contracts/compile";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { recordSampledContract, recordVerifiedContract } from "@/lib/contracts/record";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { currentContractSnapshot, recordContractSnapshot } from "@/lib/contracts/snapshot";
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
    const first = await recordContractSnapshot({ scope, iface, contract: salesOrder(), environment: "DEV", connectionId: "conn_1" });
    expect(first).toMatchObject({ status: "RECORDED", snapshot: { semver: "1.0.0", source: "METADATA", odataVersion: "V4" }, diff: null });
    if (first.status !== "RECORDED") throw new Error(first.status);

    const again = await recordContractSnapshot({ scope, iface, contract: salesOrder() });
    expect(again).toMatchObject({ status: "UNCHANGED", snapshot: { id: first.snapshot.id, semver: "1.0.0" } });

    const added = salesOrder();
    added.entityType.properties.push({ name: "Region", type: "Edm.String", nullable: true });
    const minor = await recordContractSnapshot({ scope, iface, contract: added });
    expect(minor).toMatchObject({ status: "RECORDED", snapshot: { semver: "1.1.0" }, diff: { bump: "minor" } });

    const removed = salesOrder();
    removed.entityType.properties = removed.entityType.properties.filter((p) => p.name !== "ContactEmail");
    const major = await recordContractSnapshot({ scope, iface, contract: removed });
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
      const r = await recordContractSnapshot({ scope, iface, contract: contract(), environment });
      if (r.status === "TOO_LARGE") throw new Error("too large");
      seen.push(`${environment}:${r.status}:${r.snapshot.semver}`);
    }
    expect(seen).toEqual(["PROD:RECORDED:1.0.0", "DEV:RECORDED:1.1.0", "PROD:UNCHANGED:1.0.0", "DEV:UNCHANGED:1.1.0", "PROD:UNCHANGED:1.0.0"]);
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(2);

    // PROD catching up to DEV's contract is DEV's version, not a new one.
    const caughtUp = await recordContractSnapshot({ scope, iface, contract: dev(), environment: "PROD" });
    expect(caughtUp).toMatchObject({ status: "UNCHANGED", snapshot: { semver: "1.1.0" } });

    // Another logon language relabels the same structure: a patch against the nearest contract, then stable.
    // (Relabelling the line's newest contract: TEST relabelling PROD's older
    // one would also drop ZZ1_NewField from the line, which is major.)
    const german = dev();
    german.entityType.properties[0]!.label = "Kundenauftrag";
    const test1 = await recordContractSnapshot({ scope, iface, contract: german, environment: "TEST" });
    expect(test1).toMatchObject({ status: "RECORDED", snapshot: { semver: "1.1.1" }, diff: { bump: "patch" } });
    const test2 = await recordContractSnapshot({ scope, iface, contract: german, environment: "TEST" });
    expect(test2).toMatchObject({ status: "UNCHANGED", snapshot: { semver: "1.1.1" } });
    expect(await recordContractSnapshot({ scope, iface, contract: dev(), environment: "DEV" })).toMatchObject({ status: "UNCHANGED" });
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
      const r = await recordContractSnapshot({ scope, iface, contract: contract(), environment });
      if (r.status === "TOO_LARGE") throw new Error("too large");
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
    await recordContractSnapshot({ scope, iface, contract: salesOrder(), environment: "DEV" });
    await recordContractSnapshot({ scope, iface, contract: added, environment: "DEV" });
    const back = await recordContractSnapshot({ scope, iface, contract: salesOrder(), environment: "DEV" });
    expect(back).toMatchObject({ status: "RECORDED", snapshot: { semver: "2.0.0" }, diff: { bump: "major" } });
    expect((await currentContractSnapshot(scope, iface))?.contract.entityType.properties.some((p) => p.name === "Region")).toBe(false);
  });

  it("never stores a contract too large to read back on every call", async () => {
    const iface = await newInterface("too-large");
    const huge = salesOrder();
    for (let i = 0; i < 60_000; i++) {
      huge.entityType.properties.push({ name: `ZZ1_GENERATED_EXTENSION_FIELD_${i}`, type: "Edm.String", nullable: true, label: "x".repeat(20) });
    }
    const r = await recordContractSnapshot({ scope, iface, contract: huge, environment: "DEV" });
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
      compiled: compileContract(doc),
      environment: "DEV",
      connectionId: "conn_1",
      actorId: "u1",
    });
    expect(outcome).toMatchObject({ status: "NOT_COMPILED" });
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(0);
  });

  it("is current only while the interface names the same service and dataset", async () => {
    const iface = await newInterface("repoint");
    await recordContractSnapshot({ scope, iface, contract: salesOrder() });
    expect(await currentContractSnapshot(scope, iface)).not.toBeNull();
    expect(await currentContractSnapshot(scope, { ...iface, entitySet: "SalesOrderItem" })).toBeNull();
    expect(await currentContractSnapshot(scope, { ...iface, externalId: "custom:/sap/opu/odata4/sap/zx" })).toBeNull();
    expect(await currentContractSnapshot(scope, { ...iface, entitySet: null })).toBeNull();
  });

  it("two compiles at once both succeed", async () => {
    const iface = await newInterface("race");
    await recordContractSnapshot({ scope, iface, contract: salesOrder() });
    const a = salesOrder();
    a.entityType.properties.push({ name: "A", type: "Edm.String", nullable: true });
    const b = salesOrder();
    b.entityType.properties.push({ name: "B", type: "Edm.String", nullable: true });
    const results = await Promise.all([
      recordContractSnapshot({ scope, iface, contract: a }),
      recordContractSnapshot({ scope, iface, contract: b }),
    ]);
    expect(results.every((r) => r.status === "RECORDED")).toBe(true);
    const versions = await prisma.contractSnapshot.findMany({
      where: { organizationId: ORG, interfaceId: iface.id },
      select: { semver: true },
    });
    expect(new Set(versions.map((v) => v.semver)).size).toBe(versions.length);
    expect(versions).toHaveLength(3);
  });

  it("a sampled capture is the fallback, and never pushes a compiled contract aside", async () => {
    const iface = await newInterface("sampled");
    const schema = { properties: { SalesOrder: { type: "string" }, ContactEmail: { type: "string", nullable: true } } };
    const rows = [{ SalesOrder: "1", "@odata.etag": "W/1" }];
    const sampled = await recordSampledContract({ scope, iface: { ...iface, odataVersion: null }, schema, rows, actorId: "u1" });
    expect(sampled).toMatchObject({ status: "RECORDED", semver: "1.0.0" });
    expect((await currentContractSnapshot(scope, iface))?.source).toBe("SAMPLED");

    const compiled = await recordContractSnapshot({ scope, iface, contract: salesOrder() });
    expect(compiled).toMatchObject({ status: "RECORDED", snapshot: { semver: "1.1.0", source: "METADATA" }, diff: { bump: "minor" } });

    const after = await recordSampledContract({ scope, iface: { ...iface, odataVersion: "V4" }, schema, rows, actorId: "u1" });
    expect(after).toMatchObject({ status: "METADATA_PREFERRED", semver: "1.1.0" });
    expect((await currentContractSnapshot(scope, iface))?.source).toBe("METADATA");
  });

  it("is invisible to another organization, and the guard refuses an unscoped query", async () => {
    const iface = await newInterface("tenant");
    await recordContractSnapshot({ scope, iface, contract: salesOrder() });
    expect(await currentContractSnapshot(tenantScopeOf(OTHER), iface)).toBeNull();
    await expect(prisma.contractSnapshot.findMany({ where: { interfaceId: iface.id } })).rejects.toBeInstanceOf(
      MissingTenantScopeError,
    );
  });

  it("goes with its interface", async () => {
    const iface = await newInterface("cascade");
    await recordContractSnapshot({ scope, iface, contract: salesOrder() });
    await prisma.interface.delete({ where: { id: iface.id, organizationId: ORG } });
    expect(await prisma.contractSnapshot.count({ where: { organizationId: ORG, interfaceId: iface.id } })).toBe(0);
  });
});
