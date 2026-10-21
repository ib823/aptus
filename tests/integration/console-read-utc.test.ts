// @vitest-environment node
/**
 * A console read's platform rows are stamped in UTC, whatever the database
 * session's time zone (P0.14b review round 4), against a REAL PostgreSQL.
 *
 * `consoleReadInsert` is one raw statement. Left to the column default, its
 * `at` columns took CURRENT_TIMESTAMP cast into `timestamp(3)` (no zone) at
 * the SESSION's wall time, while every row Prisma writes is stamped in UTC:
 * on a session in Asia/Tokyo the console rows were 9 hours ahead of the
 * organization's copy of the same read, and the retention sweep's UTC cutoff
 * deleted them hours early (zones behind UTC) or kept them late (ahead).
 *
 * The session's zone is set with SET LOCAL inside a transaction, so nothing
 * outside this test's own statements sees it.
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

import { consoleReadInsert } from "@/lib/audit/platform-audit";
import { prisma } from "@/lib/db/prisma";

// Opt in explicitly; never fall back to an application's DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("a console read's rows on a non-UTC database session", () => {
  const actorUserId = `p014b-utc-${randomUUID()}`;
  const READ = {
    actor: { id: actorUserId, email: "reader@abeam.test", role: "consultant", organizationId: "org-utc" },
    target: { product: "s4hana", tenantKey: "dev", tenantLabel: null, serviceKey: "purchase-orders", servicePath: null, entitySet: "A_PurchaseOrder" },
    request: { entity: "A_PurchaseOrder", limit: 2 },
    correlationId: randomUUID(),
    outcome: "SUCCEEDED" as const,
    status: 200,
    reason: null,
    durationMs: 12,
    detail: { principal: "console" },
  };

  afterAll(async () => {
    // Test-database housekeeping for this run's namespace only.
    const ids = (await prisma.platformAuditEvent.findMany({ where: { actorUserId }, select: { id: true } })).map((e) => e.id);
    await prisma.platformAuditOutcome.deleteMany({ where: { eventId: { in: ids } } });
    await prisma.platformAuditEvent.deleteMany({ where: { id: { in: ids } } });
  });

  // Fixed literals: SET takes no bind parameter for the zone.
  it.each(["Asia/Tokyo", "America/Los_Angeles"])("stamps the event and its outcome at UTC on a session in %s", async (zone) => {
    const ids = { event: randomUUID(), outcome: randomUUID() };
    const before = Date.now();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${zone}'`);
      const [setting] = await tx.$queryRaw<Array<{ tz: string }>>`SELECT current_setting('TimeZone') AS tz`;
      expect(setting?.tz).toBe(zone);
      await tx.$executeRaw(consoleReadInsert(READ, ids));
    });
    const after = Date.now();

    const row = await prisma.platformAuditEvent.findUniqueOrThrow({ where: { id: ids.event }, include: { result: true } });
    for (const at of [row.at, row.result!.at]) {
      expect(at.getTime()).toBeGreaterThanOrEqual(before - 1_000);
      expect(at.getTime()).toBeLessThanOrEqual(after + 1_000);
    }
    expect(row.result!.at.getTime()).toBe(row.at.getTime());
  });
});
