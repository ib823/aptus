// @vitest-environment node
/**
 * A verify writes the query basis and recompiles the query policy in its own
 * transaction (P1.4, 3.5.4), on PostgreSQL with the tenant guard throwing.
 *
 *   - a read interface verified against its current contract gets the basis
 *     the record job made, naming the snapshot it describes;
 *   - with a policy, the same transaction compiles it against the new basis
 *     (VERIFY mode: narrowing, not refusing), at revision + 1, and a re-verify
 *     that changes nothing keeps the compiled policy's rev, so open cursors
 *     survive it;
 *   - a field the contract no longer has is narrowed away with a warning, and
 *     the policy keeps serving;
 *   - a write interface, and a verify of an interface a PATCH bumped
 *     meanwhile, write nothing.
 *
 * Opt-in on TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { Prisma } from "@prisma/client";

import { recordJob } from "@/lib/contracts/jobs";
import { recordVerifiedContract } from "@/lib/contracts/record";
import { loadRecordHeads } from "@/lib/contracts/snapshot";
import { prisma } from "@/lib/db/prisma";
import { parseQueryBasis } from "@/lib/odata/basis";
import { parseCompiledPolicy, type CompiledQueryPolicyV1 } from "@/lib/odata/policy";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

import { source } from "../helpers/odata-query";

const RUN = `p14v-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const USER = `${RUN}-u`;
const scope = tenantScopeOf(ORG);
const DESCRIPTION = readFileSync(join(process.cwd(), "tests/fixtures/contracts/edmx/business-partner.v2.xml"), "utf8");
let solutionId = "";

async function makeInterface(operation: "READ" | "CREATE", queryPolicy: unknown = null) {
  return prisma.interface.create({
    data: {
      organizationId: ORG,
      solutionId,
      name: `${operation}-${randomUUID().slice(0, 6)}`,
      sapProduct: "s4hana",
      externalId: "business-partners",
      operation,
      mode: operation === "READ" ? "READ" : "WRITE",
      entitySet: "A_Customer",
      status: "ACTIVE",
      ...(queryPolicy === null ? {} : { queryPolicy: queryPolicy as Prisma.InputJsonValue }),
    },
    select: { id: true, version: true, externalId: true, entitySet: true, operation: true, mode: true, odataVersion: true },
  });
}

async function verify(iface: Awaited<ReturnType<typeof makeInterface>>, description = DESCRIPTION) {
  const target = { ...iface, entitySet: iface.entitySet! };
  const heads = await loadRecordHeads(scope, target, "DEV");
  return recordVerifiedContract({
    scope,
    iface: target,
    compiled: recordJob({ description, entitySet: "A_Customer", ...heads }),
    heads,
    environment: "DEV",
    connectionId: "conn_dev",
    actorId: USER,
  });
}

const columns = (id: string) =>
  prisma.interface.findFirst({
    where: { id, organizationId: ORG },
    select: { queryPolicy: true, queryBasis: true, queryPolicyCompiled: true, queryPolicyRevision: true },
  });

describe.skipIf(!process.env.TEST_DATABASE_URL)("a verify writes the query basis and recompiles the policy (P1.4)", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Query basis", type: "client" } });
    await prisma.user.create({ data: { id: USER, email: `${RUN}@abeam.com`, name: "U", role: "consultant", organizationId: ORG } });
    solutionId = (
      await prisma.solution.create({
        data: { organizationId: ORG, name: "QB", slug: `${RUN}-qb`, classification: "CLIENT_APP", businessProblem: "p", dataClass: "INTERNAL", status: "ACTIVE" },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.contractSnapshot.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: USER } });
  });

  it("writes the basis of the current contract, naming its snapshot, and no compiled policy without a source", async () => {
    const iface = await makeInterface("READ");
    const outcome = await verify(iface);
    expect(outcome).toMatchObject({ status: "RECORDED", queryBasisWritten: true, queryPolicy: null });
    const row = await columns(iface.id);
    const basis = parseQueryBasis(row!.queryBasis);
    expect(basis).not.toBeNull();
    expect(basis!.snapshot.id).toBe((outcome as { snapshotId: string }).snapshotId);
    expect(basis).toMatchObject({ entitySet: "A_Customer", odata: "V2", source: "METADATA", keys: ["Customer"] });
    expect(basis!.properties.map((p) => p.n)).toEqual(["Customer", "CustomerName", "DeletionIndicator"]);
    expect(row).toMatchObject({ queryPolicyCompiled: null, queryPolicyRevision: 0 });
  });

  it("compiles a policy against the new basis at revision + 1, and keeps its rev on a re-verify that changes nothing", async () => {
    const iface = await makeInterface("READ", source({ filter: [{ field: "Customer", ops: ["eq", "in"] }], sort: ["Customer"] }));
    const first = await verify(iface);
    expect(first).toMatchObject({ status: "RECORDED", queryBasisWritten: true, queryPolicy: { state: "READY", revision: 1, narrowed: [] } });
    const row = await columns(iface.id);
    const compiled = parseCompiledPolicy(row!.queryPolicyCompiled);
    expect("unreadable" in compiled).toBe(false);
    const c = (compiled as { compiled: CompiledQueryPolicyV1 }).compiled;
    expect(c).toMatchObject({ state: "READY", entitySet: "A_Customer", odata: "V2", key: ["Customer"], paging: "OFFSET", tieBreak: ["Customer"], revision: 1 });
    expect(row!.queryPolicyRevision).toBe(1);

    const again = await verify(iface);
    expect(again).toMatchObject({ status: "UNCHANGED", queryPolicy: { state: "READY", revision: 2 } });
    const after = await columns(iface.id);
    expect(after!.queryPolicyRevision).toBe(2);
    expect((after!.queryPolicyCompiled as { rev: string }).rev).toBe(c.rev);
  });

  it("narrows a field the contract no longer has, with a warning, and keeps serving", async () => {
    const iface = await makeInterface(
      "READ",
      source({ select: ["Customer", "CustomerName", "Region"], filter: [{ field: "Region", ops: ["eq"] }, { field: "Customer", ops: ["eq"] }], sort: ["Customer"] }),
    );
    const outcome = await verify(iface);
    expect(outcome).toMatchObject({ queryPolicy: { state: "READY" } });
    const narrowed = (outcome as { queryPolicy: { narrowed: string[] } }).queryPolicy.narrowed;
    expect(narrowed.some((n) => n.includes("Region"))).toBe(true);
    const c = (await columns(iface.id))!.queryPolicyCompiled as CompiledQueryPolicyV1;
    expect(c.fields.map((f) => f.n)).toEqual(["Customer", "CustomerName"]);
  });

  it("writes nothing for a write interface", async () => {
    const iface = await makeInterface("CREATE");
    const outcome = await verify(iface);
    expect(outcome).toMatchObject({ queryBasisWritten: false, queryPolicy: null });
    expect(await columns(iface.id)).toMatchObject({ queryBasis: null, queryPolicyCompiled: null, queryPolicyRevision: 0 });
  });

  it("writes nothing when a PATCH bumped the interface while SAP was answering", async () => {
    const iface = await makeInterface("READ", source());
    await prisma.interface.update({ where: { id: iface.id, organizationId: ORG }, data: { version: { increment: 1 } } });
    const outcome = await verify(iface);
    expect(outcome).toMatchObject({ queryBasisWritten: false, queryPolicy: null });
    expect(await columns(iface.id)).toMatchObject({ queryBasis: null, queryPolicyCompiled: null, queryPolicyRevision: 0 });
  });
});
