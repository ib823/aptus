// @vitest-environment node
/**
 * The Studio list's response-schema states, read from the stamp IN THE
 * DATABASE (response-schema-states.ts), against real PostgreSQL: the same
 * answer as responseSchemaState (contract-provenance.ts) gives from the
 * whole stored schema, for every shape a stored value can have — while the
 * list never selects the schema itself (P1.3 structural containment).
 *
 * Opt-in on TEST_DATABASE_URL; rows are namespaced and removed.
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { LIMITS } from "@/lib/contracts/budget";
import { prisma } from "@/lib/db/prisma";
import { responseSchemaState } from "@/lib/studio/contract-provenance";
import {
  capturedSchemaFacts,
  readCurrentCapturedSchemas,
  responseSchemaStates,
} from "@/lib/studio/response-schema-states";
import { servedResponseSchema } from "@/lib/studio/schema-capture";

const RUN = `rss-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const OTHER = `${RUN}-other`;

const captured = (stamp: unknown) => ({ type: "object", properties: { a: { type: "string" } }, "x-captured": stamp });

/** Every shape a stored responseSchema can have, against an interface at v3 on "Orders". */
const SHAPES: [string, unknown][] = [
  ["SQL NULL", Prisma.DbNull],
  ["JSON null", Prisma.JsonNull],
  ["a scalar", "x"],
  ["an array", [1, 2]],
  ["an object that is not a captured schema", { type: "string" }],
  ["a captured schema whose properties are not an object", { type: "object", properties: "x" }],
  ["a captured schema with no stamp", { type: "object", properties: {} }],
  ["a stamp that is not an object", captured("v3")],
  ["a stamp whose version is a string", captured({ interfaceVersion: "3", entitySet: "Orders" })],
  ["this contract's stamp", captured({ interfaceVersion: 3, entitySet: "Orders" })],
  ["an earlier version's", captured({ interfaceVersion: 2, entitySet: "Orders" })],
  ["another dataset's", captured({ interfaceVersion: 3, entitySet: "Items" })],
  ["a stamp with no dataset", captured({ interfaceVersion: 3 })],
  ["a stamp whose dataset is not a string", captured({ interfaceVersion: 3, entitySet: 7 })],
  ["a fractional version", captured({ interfaceVersion: 3.5, entitySet: "Orders" })],
  ["properties as an array", { type: "object", properties: [], "x-captured": { interfaceVersion: 3, entitySet: "Orders" } }],
];

describe.skipIf(!process.env.TEST_DATABASE_URL)("responseSchemaStates, against real PostgreSQL", () => {
  let solutionId = "";
  const ids: { id: string; label: string; stored: unknown; entitySet: string | null }[] = [];

  beforeAll(async () => {
    for (const id of [ORG, OTHER]) await prisma.organization.create({ data: { id, name: `RSS ${id}`, type: "client" } });
    const s = await prisma.solution.create({
      data: {
        organizationId: ORG,
        name: "List",
        slug: `${RUN}-app`,
        classification: "CLIENT_APP",
        businessProblem: "States test.",
        dataClass: "INTERNAL",
        status: "ACTIVE",
        technicalOwnerId: `${RUN}-u`,
        businessOwnerId: `${RUN}-u`,
        supportOwnerId: `${RUN}-u`,
      },
      select: { id: true },
    });
    solutionId = s.id;
    for (const entitySet of ["Orders", null]) {
      for (const [label, value] of SHAPES) {
        const row = await prisma.interface.create({
          data: {
            organizationId: ORG,
            solutionId,
            name: `${label} ${entitySet ?? "-"}`,
            sapProduct: "s4hana",
            externalId: "CE_SALESORDER_0001",
            operation: "READ",
            mode: "READ",
            entitySet,
            version: 3,
            responseSchema: value as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        const back = await prisma.interface.findFirst({ where: { id: row.id, organizationId: ORG }, select: { responseSchema: true } });
        ids.push({ id: row.id, label, stored: back!.responseSchema, entitySet });
      }
    }
  });

  afterAll(async () => {
    await prisma.interface.deleteMany({ where: { organizationId: ORG } });
    await prisma.solution.deleteMany({ where: { organizationId: ORG } });
    for (const id of [ORG, OTHER]) await prisma.organization.delete({ where: { id } });
    await prisma.$disconnect();
  });

  it("is responseSchemaState, fact for fact, for every stored shape", async () => {
    const states = await responseSchemaStates(
      ORG,
      ids.map((i) => ({ id: i.id, version: 3, entitySet: i.entitySet })),
    );
    for (const i of ids) {
      expect(states.get(i.id), `${i.label} (${i.entitySet ?? "no dataset"})`).toBe(
        responseSchemaState(i.stored, { version: 3, entitySet: i.entitySet }),
      );
    }
    // The shapes reach every state.
    expect(new Set(states.values())).toEqual(new Set(["none", "unverified", "current", "stale"]));
  });

  it("reads one organisation only, and narrows to one solution when asked", async () => {
    const one = ids.find((i) => i.label === "this contract's stamp")!;
    const asOther = await responseSchemaStates(OTHER, [{ id: one.id, version: 3, entitySet: "Orders" }]);
    expect(asOther.get(one.id)).toBe("none");
    const inSolution = await responseSchemaStates(ORG, [{ id: one.id, version: 3, entitySet: "Orders" }], solutionId);
    expect(inSolution.get(one.id)).toBe("current");
    const inAnother = await responseSchemaStates(ORG, [{ id: one.id, version: 3, entitySet: "Orders" }], "no-such-solution");
    expect(inAnother.get(one.id)).toBe("none");
  });

  /*
   * Structural hardening round 1: the readers that serve the schema learn its
   * stored size from the database first, and read only a current one inside
   * the captured-schema bound.
   */
  it("says how large each stored value is, with the same state, by id, without reading it", async () => {
    const asked = ids.map((i) => ({ id: i.id, version: 3, entitySet: i.entitySet }));
    const facts = await capturedSchemaFacts(ORG, asked);
    for (const i of ids) {
      const f = facts.get(i.id)!;
      expect(f.state, i.label).toBe(responseSchemaState(i.stored, { version: 3, entitySet: i.entitySet }));
      if (i.stored === null) expect(f.storedBytes).toBeNull();
      else {
        // Postgres's text of it: never less than the compact JSON, never more than twice it.
        const compact = Buffer.byteLength(JSON.stringify(i.stored));
        expect(f.storedBytes, i.label).toBeGreaterThanOrEqual(compact);
        expect(f.storedBytes, i.label).toBeLessThanOrEqual(2 * compact);
      }
    }
    expect((await capturedSchemaFacts(OTHER, asked)).get(ids[0]!.id)).toEqual({ state: "none", storedBytes: null });
  });

  it("reads a current schema inside its bound as served, and names one past it without reading it", async () => {
    const one = ids.find((i) => i.label === "this contract's stamp" && i.entitySet === "Orders")!;
    const iface = { id: one.id, version: 3, entitySet: "Orders" };
    const facts = await capturedSchemaFacts(ORG, [iface]);
    expect((await readCurrentCapturedSchemas(ORG, [iface], facts)).get(one.id)).toEqual({
      ok: true,
      schema: servedResponseSchema(one.stored),
      stored: one.stored,
    });
    const past = new Map([[one.id, { state: "current" as const, storedBytes: LIMITS.capturedSchema.storedTextBytes + 1 }]]);
    expect((await readCurrentCapturedSchemas(ORG, [iface], past)).get(one.id)).toMatchObject({ ok: false, reason: "TOO_LARGE" });
  });
});
