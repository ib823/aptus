// @vitest-environment node
/**
 * P0.19: the governed call's two SQL statements return exactly what the
 * Prisma queries they replaced returned, on PostgreSQL.
 *
 * WHY THIS TEST. src/lib/governed/call-loads.ts merges seven lookups into
 * two statements, which the tenant guard (a Prisma extension) cannot see.
 * Every unit and property test answers those statements through the
 * reference queries (tests/helpers/governed-loads.ts). This is where the two
 * are proven to agree — over rows chosen to tell them apart: a previous key
 * inside its overlap, a dropped key, a retired solution, an orphaned key, and
 * ANOTHER ORGANISATION's rows carrying this organisation's solution and
 * interface ids, where only the organization filter keeps them out.
 *
 * Skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { loadConsoleConnection, loadInterfaceAccess, lookupCredential } from "@/lib/governed/call-loads";
import { hashClientToken } from "@/lib/northbound/auth";

import { referenceAccessLoad, referenceConsoleConnection, referenceCredentialLookup, type ReferenceFake } from "../helpers/governed-loads";

const RUN = `p019c-${randomUUID().slice(0, 8)}`;
const A = `${RUN}-a`;
const B = `${RUN}-b`;
const DAY = 86_400_000;
const ref = () => prisma as unknown as ReferenceFake;
const ids = { solA: "", retiredSol: "", solB: "", ifaceA: "", ifaceOtherProduct: "", ifaceB: "", user: `${RUN}-user` };
const tokens: Record<string, string> = {};

/** A row as plain values, Dates as epoch milliseconds, keys sorted. */
function plain(row: Record<string, unknown> | null | undefined, keys?: readonly string[]): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const key of (keys ?? Object.keys(row)).slice().sort()) {
    const v = row[key];
    out[key] = v instanceof Date ? v.getTime() : v === undefined ? null : v;
  }
  return out;
}

async function sqlCredential(hash: string) {
  const found = await lookupCredential(hash, { withWriteKey: true });
  if (!found) return [];
  return [plain({ ...found.row, match: found.match, solutionStatus: found.solutionStatus, secretsCiphertext: found.secretsCiphertext })];
}

async function referenceCredential(hash: string) {
  return (await referenceCredentialLookup(ref(), hash, true)).map((r) => plain(r));
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("the governed call loads agree with the queries they replaced (P0.19)", () => {
  beforeAll(async () => {
    for (const org of [A, B]) await prisma.organization.create({ data: { id: org, name: org, type: "client" } });
    await prisma.user.create({ data: { id: ids.user, email: `${RUN}@abeam.com`, name: "U", role: "consultant", organizationId: A } });
    const solution = async (organizationId: string, slug: string, status: "ACTIVE" | "RETIRED") =>
      (
        await prisma.solution.create({
          data: { organizationId, name: slug, slug: `${RUN}-${slug}`, classification: "CLIENT_APP", businessProblem: "p", dataClass: "INTERNAL", status },
        })
      ).id;
    ids.solA = await solution(A, "a", "ACTIVE");
    ids.retiredSol = await solution(A, "retired", "RETIRED");
    ids.solB = await solution(B, "b", "ACTIVE");

    const client = async (name: string, data: Record<string, unknown>) => {
      tokens[name] = `ce_test_${RUN}_${name}`;
      return prisma.solutionClient.create({
        data: {
          organizationId: A,
          solutionId: ids.solA,
          label: name,
          createdById: ids.user,
          tokenHash: hashClientToken(tokens[name]!),
          environment: "DEV",
          ...data,
        },
      });
    };
    // A rotated key: the current one, and the replaced one inside its overlap.
    tokens.previous = `ce_test_${RUN}_previous`;
    const rotated = await client("current", {
      previousTokenHash: hashClientToken(tokens.previous),
      previousValidUntil: new Date(Date.now() + DAY),
      lastUsedAt: new Date(Date.now() - 5_000),
      secretsCiphertext: "sealed-write-key",
    });
    await prisma.solutionClient.update({
      where: { id: rotated.id, organizationId: A },
      data: { overlapForTokenHash: hashClientToken(tokens.current!) },
    });
    // A key the row dropped.
    tokens.dropped = `ce_test_${RUN}_dropped`;
    await prisma.retiredClientToken.create({ data: { tokenHash: hashClientToken(tokens.dropped), clientId: rotated.id, organizationId: A } });
    await client("retiredSolution", { solutionId: ids.retiredSol, environment: "TEST" });
    await client("orphan", { solutionId: `${RUN}-gone`, environment: "SANDBOX" });
    await client("revoked", { environment: "PROD", revokedAt: new Date(), isActive: false });
    // ANOTHER ORGANISATION's key naming this organisation's solution id: the
    // solution join must not find it (organization, not id alone).
    tokens.foreign = `ce_test_${RUN}_foreign`;
    await prisma.solutionClient.create({
      data: { organizationId: B, solutionId: ids.solA, label: "foreign", createdById: ids.user, tokenHash: hashClientToken(tokens.foreign), environment: "DEV" },
    });

    const iface = async (organizationId: string, solutionId: string, sapProduct: string, extra: Record<string, unknown> = {}) =>
      (
        await prisma.interface.create({
          data: {
            organizationId,
            solutionId,
            name: "PO",
            sapProduct,
            externalId: "purchase-orders",
            operation: "READ",
            mode: "READ",
            entitySet: "A_PurchaseOrder",
            status: "ACTIVE",
            serviceVerifications: { DEV: [{ at: "2026-10-01T00:00:00.000Z", connectionId: "c" }] },
            grantMatchChangedAt: new Date(Date.now() - 3 * DAY),
            ...extra,
          },
        })
      ).id;
    ids.ifaceA = await iface(A, ids.solA, "s4hana", { servicePath: null });
    ids.ifaceOtherProduct = await iface(A, ids.solA, "s4hana-onprem");
    ids.ifaceB = await iface(B, ids.solB, "s4hana");

    let at = Date.now() - 10 * DAY;
    const grant = (organizationId: string, data: Record<string, unknown>) =>
      prisma.apiAccessGrant.create({
        data: {
          organizationId,
          solutionId: ids.solA,
          externalId: "purchase-orders",
          operation: "READ",
          environment: "DEV",
          justification: "j",
          decision: "APPROVED",
          expiresAt: new Date(Date.now() + DAY),
          createdAt: new Date((at += 1000)),
          ...data,
        },
      });
    await grant(A, { interfaceId: ids.ifaceA, sapProduct: "s4hana" }); // in
    await grant(A, { interfaceId: ids.ifaceA, sapProduct: "s4hana", revokedAt: new Date(), unboundLastUsedAt: new Date() }); // in
    await grant(A, { interfaceId: null, sapProduct: null, unboundCutoffAt: new Date(Date.now() - DAY) }); // in (legacy)
    await grant(A, { interfaceId: ids.ifaceOtherProduct, sapProduct: "s4hana-onprem" }); // out: another interface
    await grant(A, { interfaceId: ids.ifaceA, sapProduct: "s4hana-onprem" }); // out: another product
    await grant(A, { interfaceId: null, externalId: "purchase-contracts" }); // out: another tuple
    await grant(A, { interfaceId: null, operation: "CREATE" }); // out: another operation
    await grant(A, { interfaceId: ids.ifaceA, sapProduct: "s4hana", environment: "TEST" }); // out: another environment
    await grant(A, { interfaceId: null, solutionId: ids.retiredSol }); // out: another solution
    await grant(B, { interfaceId: ids.ifaceA, sapProduct: "s4hana" }); // out: another organisation, this solution and interface
    await grant(B, { interfaceId: null }); // out: another organisation

    const connection = (organizationId: string, key: string, data: Record<string, unknown> = {}) =>
      prisma.sapConnection.create({
        data: {
          organizationId,
          product: "s4hana",
          key: `${RUN}-${key}`,
          label: key,
          baseUrl: "https://my000001-api.s4hana.cloud.sap",
          authType: "basic",
          secretsCiphertext: `sealed-${key}`,
          createdAt: new Date((at += 1000)),
          ...data,
        },
      });
    await connection(A, "dev", { environment: "DEV", writeEnabled: true, client: "100", timeoutMs: 9000 }); // in
    await connection(A, "undeclared"); // in
    await connection(A, "inactive", { isActive: false }); // out
    await connection(A, "onprem", { product: "s4hana-onprem" }); // out: another product
    await connection(B, "foreign", { environment: "DEV" }); // out: another organisation
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: A } });
    await prisma.organization.delete({ where: { id: B } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  it.each(["current", "previous", "dropped", "retiredSolution", "orphan", "revoked", "foreign", "unknown"])(
    "the credential lookup returns what the four lookups returned: %s",
    async (name) => {
      const hash = hashClientToken(tokens[name] ?? `ce_test_${RUN}_never_issued`);
      const sql = await sqlCredential(hash);
      expect(sql).toEqual(await referenceCredential(hash));
      // And the cases are what they claim to be.
      const expected: Record<string, unknown> = {
        current: { match: "current", solutionStatus: "ACTIVE" },
        previous: { match: "previous", solutionStatus: "ACTIVE" },
        dropped: { match: "retired", solutionStatus: "ACTIVE" },
        retiredSolution: { match: "current", solutionStatus: "RETIRED" },
        orphan: { match: "current", solutionStatus: null },
        revoked: { match: "current", solutionStatus: "ACTIVE" },
        // The other organisation's key names this organisation's solution:
        // read as missing, never as this organisation's ACTIVE solution.
        foreign: { match: "current", solutionStatus: null },
      };
      if (name === "unknown") expect(sql).toEqual([]);
      else expect(sql[0]).toEqual(expect.objectContaining(expected[name] as object));
    },
  );

  it("reads the sealed write key only when asked", async () => {
    const hash = hashClientToken(tokens.current!);
    expect((await lookupCredential(hash, { withWriteKey: true }))?.secretsCiphertext).toBe("sealed-write-key");
    expect((await lookupCredential(hash))?.secretsCiphertext).toBeNull();
  });

  async function both(organizationId: string, interfaceId: string, environment: string, withConnections: boolean) {
    const sql = await loadInterfaceAccess(organizationId, ids.solA, interfaceId, environment, { withConnections });
    const [reference] = await referenceAccessLoad(ref(), interfaceId, organizationId, ids.solA, environment, withConnections);
    const r = reference as { iface: Record<string, unknown> | null; grants: Record<string, unknown>[] | null; connections: Record<string, unknown>[] | null };
    const ifaceKeys = sql.iface ? Object.keys(sql.iface) : undefined;
    const grantKeys = sql.grants[0] ? Object.keys(sql.grants[0]) : [];
    const connectionKeys = sql.connections?.[0] ? Object.keys(sql.connections[0]) : [];
    const byId = (a: Record<string, unknown> | null, b: Record<string, unknown> | null) => String(a?.id).localeCompare(String(b?.id));
    return {
      sql: {
        iface: plain(sql.iface as unknown as Record<string, unknown>, ifaceKeys),
        grants: sql.grants.map((g) => plain(g as unknown as Record<string, unknown>, grantKeys)).sort(byId),
        connections: sql.connections === null ? null : sql.connections.map((c) => plain(c as unknown as Record<string, unknown>, connectionKeys)),
      },
      reference: {
        iface: plain(r.iface, ifaceKeys),
        grants: (r.grants ?? []).map((g) => plain(g, grantKeys)).sort(byId),
        // The reference orders by createdAt, as resolveSapConnections does; so does the SQL.
        connections: withConnections ? (r.connections ?? []).map((c) => plain(c, connectionKeys)) : null,
      },
      counts: { grants: sql.grants.length, connections: sql.connections?.length ?? null },
    };
  }

  it("the access load returns the interface, grants and connections the three queries returned", async () => {
    const { sql, reference, counts } = await both(A, ids.ifaceA, "DEV", true);
    expect(sql).toEqual(reference);
    // Not vacuous: three grants and two connections are this call's, and every
    // other organisation's, interface's, product's, tuple's, environment's and
    // solution's row is left out.
    expect(counts).toEqual({ grants: 3, connections: 2 });
    expect(sql.iface?.serviceVerifications).toEqual({ DEV: [{ at: "2026-10-01T00:00:00.000Z", connectionId: "c" }] });
  });

  it("reads no connection unless asked", async () => {
    const { sql, reference } = await both(A, ids.ifaceA, "DEV", false);
    expect(sql).toEqual(reference);
    expect(sql.connections).toBeNull();
  });

  it("finds nothing for another organisation's interface id, and reads nothing beside it", async () => {
    const { sql, reference } = await both(A, ids.ifaceB, "DEV", true);
    expect(sql).toEqual(reference);
    expect(sql).toEqual({ iface: null, grants: [], connections: [] });
  });

  it("agrees in another environment", async () => {
    const { sql, reference, counts } = await both(A, ids.ifaceA, "TEST", true);
    expect(sql).toEqual(reference);
    expect(counts.grants).toBe(1);
  });

  /*
   * P0.14b review round 5: a console read's connection and its environment
   * ceiling's grants, in one statement, against the two queries it replaced
   * (resolveSapConnection's named row, decideConsoleRead's grant lookup).
   */
  describe("the console connection load", () => {
    async function console_(organizationId: string, product: string, key: string) {
      const sql = await loadConsoleConnection(organizationId, product, `${RUN}-${key}`);
      const [reference] = (await referenceConsoleConnection(ref(), organizationId, product, `${RUN}-${key}`)) as {
        connection: Record<string, unknown> | null;
        grants: Record<string, unknown>[] | null;
      }[];
      const connectionKeys = sql.connection ? Object.keys(sql.connection) : undefined;
      const grantKeys = ["decision", "expiresAt", "revokedAt", "interfaceId", "solutionStatus"];
      const order = (a: Record<string, unknown> | null, b: Record<string, unknown> | null) => JSON.stringify(a).localeCompare(JSON.stringify(b));
      return {
        sql: {
          connection: plain(sql.connection as unknown as Record<string, unknown> | null, connectionKeys),
          grants: sql.grants.map((g) => plain(g as unknown as Record<string, unknown>, grantKeys)).sort(order),
        },
        reference: {
          connection: plain(reference!.connection, connectionKeys),
          grants: (reference!.grants ?? []).map((g) => plain(g, grantKeys)).sort(order),
        },
      };
    }

    it("returns the named connection and every grant of the organization for its environment", async () => {
      const { sql, reference } = await console_(A, "s4hana", "dev");
      expect(sql).toEqual(reference);
      // Not vacuous: all eight of this organisation's DEV grants, whatever their
      // solution, interface or state (the ceiling judges them); not its TEST
      // grant, and not the other organisation's.
      expect(sql.connection).toEqual(expect.objectContaining({ key: `${RUN}-dev`, environment: "DEV", client: "100", timeoutMs: 9000 }));
      expect(sql.grants).toHaveLength(8);
      expect(sql.grants.filter((g) => g!.revokedAt !== null)).toHaveLength(1);
    });

    it("reads no grant for a connection that declares no environment", async () => {
      const { sql, reference } = await console_(A, "s4hana", "undeclared");
      expect(sql).toEqual(reference);
      expect(sql.connection?.environment).toBeNull();
      expect(sql.grants).toEqual([]);
    });

    it.each([
      ["an inactive connection", A, "s4hana", "inactive"],
      ["a connection of another product", A, "s4hana", "onprem"],
      ["another organisation's connection key", A, "s4hana", "foreign"],
      ["a key no one has", A, "s4hana", "nowhere"],
    ])("finds nothing, and reads no grant, for %s", async (_name, org, product, key) => {
      const { sql, reference } = await console_(org, product, key);
      expect(sql).toEqual(reference);
      expect(sql).toEqual({ connection: null, grants: [] });
    });

    it("reads the other organisation's own connection with its own grants only", async () => {
      const { sql, reference } = await console_(B, "s4hana", "foreign");
      expect(sql).toEqual(reference);
      expect(sql.connection?.organizationId).toBe(B);
      expect(sql.grants).toHaveLength(2);
    });
  });
});
