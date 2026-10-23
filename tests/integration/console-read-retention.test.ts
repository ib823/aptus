// @vitest-environment node
/**
 * The console's platform-scope read rows expire with the organization's copy
 * (P0.14b review), against a REAL PostgreSQL.
 *
 * What only a database can prove: a PlatformConsoleRead past the period goes
 * and a recent one stays; for the console reads a pre-release P0.14b build
 * left on PlatformAuditEvent, the outcome rows, held by a RESTRICT foreign
 * key, go with their events in one transaction, the relation filter on the
 * outcome delete selects what the unit test says it does, and the write-back's
 * rows on the same table (P0.7) are untouched at any age, with or without an
 * outcome.
 *
 * The rows are dated in the year 2000 and the sweep runs "in" February 2000,
 * so nothing another test wrote is old enough to be swept by it.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { enforceNorthboundAuditRetention } from "@/lib/northbound/retention";

// Opt in explicitly; never fall back to an application's DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("console read retention on real PostgreSQL", () => {
  const actorUserId = `p014b-retention-${randomUUID()}`;
  const NOW = new Date("2000-02-15T00:00:00.000Z");
  const OLD = new Date("2000-01-01T00:00:00.000Z");
  const RECENT = new Date("2000-02-10T00:00:00.000Z");

  const event = (action: string, at: Date, outcome: string | null) =>
    prisma.platformAuditEvent.create({
      data: {
        action,
        actorUserId,
        actorEmail: "reader@abeam.test",
        actorRole: "consultant",
        actorOrganizationId: "org-retention",
        product: "s4hana",
        tenantKey: "dev",
        tenantLabel: "Client DEV",
        serviceKey: "purchase-orders",
        entitySet: "A_PurchaseOrder",
        payloadSha256: "0".repeat(64),
        payloadFields: [],
        correlationId: randomUUID(),
        at,
        ...(outcome ? { result: { create: { outcome, at } } } : {}),
      },
      select: { id: true },
    });

  afterAll(async () => {
    // Test-database housekeeping for this run's namespace only.
    const ids = (await prisma.platformAuditEvent.findMany({ where: { actorUserId }, select: { id: true } })).map((e) => e.id);
    await prisma.platformAuditOutcome.deleteMany({ where: { eventId: { in: ids } } });
    await prisma.platformAuditEvent.deleteMany({ where: { id: { in: ids } } });
    await prisma.platformConsoleRead.deleteMany({ where: { actorUserId } });
  });

  const consoleRead = (at: Date) =>
    prisma.platformConsoleRead.create({
      data: {
        actorUserId,
        actorEmail: "reader@abeam.test",
        actorRole: "consultant",
        actorOrganizationId: "org-retention",
        product: "s4hana",
        tenantKey: "dev",
        serviceKey: "purchase-orders",
        entitySet: "A_PurchaseOrder",
        payloadSha256: "0".repeat(64),
        payloadFields: [],
        correlationId: randomUUID(),
        outcome: "SUCCEEDED",
        status: 200,
        detail: { principal: "console" },
        at,
      },
      select: { id: true },
    });

  it("deletes PlatformConsoleRead rows past the period, and keeps the recent ones (integration review round 4)", async () => {
    await consoleRead(OLD);
    const recent = await consoleRead(RECENT);
    const result = await enforceNorthboundAuditRetention(NOW, 30);
    expect(result.consoleReadsDeleted).toBeGreaterThanOrEqual(1);
    const left = await prisma.platformConsoleRead.findMany({ where: { actorUserId }, select: { id: true } });
    expect(left.map((r) => r.id)).toEqual([recent.id]);
  });

  it("deletes the old console reads a pre-release build left on PlatformAuditEvent, with their outcomes, and nothing else", async () => {
    const oldRead = await event("SAP_CONSOLE_READ", OLD, "SUCCEEDED");
    const recentRead = await event("SAP_CONSOLE_READ", RECENT, "SAP_REFUSED");
    const oldWrite = await event("SAP_WORKBENCH_WRITE", OLD, "SUCCEEDED");
    const unresolvedWrite = await event("SAP_WORKBENCH_WRITE_TEST", OLD, null);

    const result = await enforceNorthboundAuditRetention(NOW, 30);
    expect(result.consoleReadsDeleted).toBeGreaterThanOrEqual(1);

    const left = await prisma.platformAuditEvent.findMany({ where: { actorUserId }, include: { result: true } });
    expect(left.map((e) => e.id).sort()).toEqual([recentRead.id, oldWrite.id, unresolvedWrite.id].sort());
    expect(await prisma.platformAuditOutcome.count({ where: { eventId: oldRead.id } })).toBe(0);
    // The write-back's trail keeps its outcome; the unresolved write keeps having none.
    expect(left.find((e) => e.id === oldWrite.id)?.result?.outcome).toBe("SUCCEEDED");
    expect(left.find((e) => e.id === unresolvedWrite.id)?.result).toBeNull();
  });
});
