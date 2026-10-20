// @vitest-environment node
/**
 * The P0.4 backfill stamps each existing capture with its contract — where the
 * audit trail establishes it — against real PostgreSQL (audit A38).
 *
 * Readers now publish a schema or fixture only when its stamp matches the
 * interface (contract-provenance.ts), so the deploy must stamp everything
 * provably current, or it would withhold good contracts from developers. And
 * it must stamp nothing provably stale as current, or the A38 artifacts
 * already in production would keep being served. One case each:
 *
 *   A  version 1, never changed            → stamped current
 *   B  changed to v2, captured after       → stamped current
 *   C  changed to v2, captured before      → stamped v1 (stale, kept)
 *   D  version 3, no audited change        → left unstamped (unverified)
 *   E  audit trail stops at v2 of v3       → left unstamped (unverified)
 *   F  already stamped                     → untouched
 *   G  capturedAt not in toISOString form  → untouched, and no failure
 *   H  an audit row whose version is not an integer → ignored, no failure
 *
 * And: a second run changes nothing; the migration holds exactly these
 * statements. Opt-in on TEST_DATABASE_URL; rows are namespaced and removed.
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

import { prisma } from "@/lib/db/prisma";
import { artifactState, responseSchemaState, schemaStamp } from "@/lib/studio/contract-provenance";
import { CONTRACT_STAMP_BACKFILL_SQL } from "@/lib/studio/contract-stamp-backfill";
import { inferResponseSchema } from "@/lib/studio/schema-capture";

const RUN = `p04-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const CHANGED_AT = new Date("2026-08-01T00:00:00.000Z");
const BEFORE = new Date("2026-07-15T00:00:00.000Z");
const AFTER = new Date("2026-08-15T00:00:00.000Z");
const ROWS = [{ BusinessPartner: "1" }];

let solutionId = "";

/** An unstamped schema, as capture stored it before P0.4, captured at `at`. */
function legacySchema(at: Date | string): unknown {
  const schema = inferResponseSchema(ROWS, new Date("2026-01-01T00:00:00.000Z"))!;
  return { ...schema, "x-captured": { ...schema["x-captured"], capturedAt: typeof at === "string" ? at : at.toISOString() } };
}

async function iface(name: string, version: number, responseSchema: unknown, fixtureAt?: Date): Promise<string> {
  const row = await prisma.interface.create({
    data: {
      organizationId: ORG,
      solutionId,
      name,
      version,
      sapProduct: "s4hana",
      externalId: "API_BUSINESS_PARTNER",
      operation: "READ",
      mode: "READ",
      entitySet: `Set_${name}`,
      responseSchema: responseSchema as never,
    },
    select: { id: true },
  });
  if (fixtureAt) {
    await prisma.mockFixture.create({
      data: { organizationId: ORG, interfaceId: row.id, scenario: "data", status: 200, body: { records: ROWS }, capturedAt: fixtureAt },
    });
  }
  return row.id;
}

/** A Studio PATCH audit row recording a version change, as the route writes it. */
async function versionChange(interfaceId: string, from: unknown, to: unknown, at: Date): Promise<void> {
  await prisma.configAudit.create({
    data: {
      organizationId: ORG,
      actorId: `${RUN}-bob`,
      entityType: "Interface",
      entityId: interfaceId,
      action: "UPDATE",
      before: { id: interfaceId, version: from } as never,
      after: { id: interfaceId, version: to, contractChanged: true } as never,
      at,
    },
  });
}

async function backfill(): Promise<void> {
  for (const statement of CONTRACT_STAMP_BACKFILL_SQL) await prisma.$executeRawUnsafe(statement);
}

async function load(id: string) {
  const i = await prisma.interface.findFirst({
    where: { id, organizationId: ORG },
    select: { version: true, entitySet: true, responseSchema: true },
  });
  const f = await prisma.mockFixture.findFirst({
    where: { organizationId: ORG, interfaceId: id },
    select: { interfaceVersion: true, entitySet: true },
  });
  return { iface: i!, fixture: f };
}

const ids: Record<string, string> = {};

describe.skipIf(!process.env.TEST_DATABASE_URL)("the contract-stamp backfill, against real PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "P0.4 backfill", type: "client" } });
    const s = await prisma.solution.create({
      data: {
        organizationId: ORG,
        name: "Partner portal",
        slug: `${RUN}-app`,
        classification: "CLIENT_APP",
        businessProblem: "Backfill test.",
        dataClass: "INTERNAL",
        status: "ACTIVE",
        technicalOwnerId: `${RUN}-dana`,
        businessOwnerId: `${RUN}-dana`,
        supportOwnerId: `${RUN}-dana`,
      },
      select: { id: true },
    });
    solutionId = s.id;

    ids.A = await iface("A", 1, legacySchema(AFTER), AFTER);
    ids.B = await iface("B", 2, legacySchema(AFTER), BEFORE);
    await versionChange(ids.B, 1, 2, CHANGED_AT);
    ids.C = await iface("C", 2, legacySchema(BEFORE), AFTER);
    await versionChange(ids.C, 1, 2, CHANGED_AT);
    ids.D = await iface("D", 3, legacySchema(AFTER), AFTER);
    ids.E = await iface("E", 3, legacySchema(AFTER), AFTER);
    await versionChange(ids.E, 1, 2, CHANGED_AT);
    const stamped = inferResponseSchema(ROWS, AFTER, { version: 7, entitySet: "Elsewhere" });
    ids.F = await iface("F", 1, stamped);
    ids.G = await iface("G", 1, legacySchema("not a date"));
    ids.H = await iface("H", 2, legacySchema(AFTER), AFTER);
    await versionChange(ids.H, "one", "two", CHANGED_AT);

    await backfill();
  });

  afterAll(async () => {
    await prisma.mockFixture.deleteMany({ where: { organizationId: ORG } });
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.$disconnect();
  });

  it("A: an interface still at v1 — its captures are current", async () => {
    const { iface: i, fixture } = await load(ids.A!);
    expect(responseSchemaState(i.responseSchema, i)).toBe("current");
    expect(fixture).toEqual({ interfaceVersion: 1, entitySet: "Set_A" });
  });

  it("B: captured after the audited change — current; the fixture recorded before it is stale", async () => {
    const { iface: i, fixture } = await load(ids.B!);
    expect(responseSchemaState(i.responseSchema, i)).toBe("current");
    expect(fixture!.interfaceVersion).toBe(1);
    expect(artifactState(fixture!, i)).toBe("stale");
  });

  it("C: captured before the change — stamped with the version it belongs to, never current", async () => {
    const { iface: i, fixture } = await load(ids.C!);
    expect(schemaStamp(i.responseSchema).interfaceVersion).toBe(1);
    expect(responseSchemaState(i.responseSchema, i)).toBe("stale");
    expect(artifactState(fixture!, i)).toBe("current");
  });

  it("D and E: a contract nobody can establish stays unstamped — unverified", async () => {
    for (const id of [ids.D!, ids.E!]) {
      const { iface: i, fixture } = await load(id);
      expect(responseSchemaState(i.responseSchema, i)).toBe("unverified");
      expect(fixture!.interfaceVersion).toBeNull();
    }
  });

  it("F: an already-stamped schema is untouched", async () => {
    const { iface: i } = await load(ids.F!);
    expect(schemaStamp(i.responseSchema)).toEqual({ interfaceVersion: 7, entitySet: "Elsewhere" });
  });

  it("G and H: malformed values are passed over, not cast", async () => {
    expect(responseSchemaState((await load(ids.G!)).iface.responseSchema, { version: 1, entitySet: "Set_G" })).toBe("unverified");
    const h = await load(ids.H!);
    expect(responseSchemaState(h.iface.responseSchema, h.iface)).toBe("unverified");
  });

  it("keeps everything else in the schema as it was", async () => {
    const { iface: i } = await load(ids.A!);
    const captured = (i.responseSchema as { "x-captured": Record<string, unknown>; properties: Record<string, unknown> });
    expect(captured.properties).toHaveProperty("BusinessPartner");
    expect(captured["x-captured"].capturedAt).toBe(AFTER.toISOString());
    expect(captured["x-captured"].sampleSize).toBe(1);
  });

  it("a second run changes nothing", async () => {
    const before = await Promise.all(Object.values(ids).map(load));
    await backfill();
    const after = await Promise.all(Object.values(ids).map(load));
    expect(after).toEqual(before);
  });
});

describe("the migration holds the backfill", () => {
  it("every statement, in order", () => {
    const migration = readFileSync(
      path.join(process.cwd(), "prisma/migrations/20261023010000_contract_stamps/migration.sql"),
      "utf8",
    );
    let at = 0;
    for (const statement of CONTRACT_STAMP_BACKFILL_SQL) {
      const found = migration.indexOf(statement, at);
      expect(found, statement.slice(0, 120)).toBeGreaterThan(-1);
      at = found + statement.length;
    }
    expect(migration).toContain('ALTER TABLE "MockFixture" ADD COLUMN');
  });
});
