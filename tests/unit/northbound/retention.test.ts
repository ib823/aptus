/**
 * Retention for the northbound audit trail (audit E14/E15, P0-adjacent).
 *
 * The table had no retention and no index on `correlationId`: a correlation id
 * the caller was told to quote led to a lookup with no query path, on a table
 * that only ever grew. `reap.ts` declined to sweep it and named three conditions
 * for doing it later — a stated period, a legal basis, a tested exception. This
 * file is the third one.
 *
 * The behaviour worth pinning is not "it deletes old rows". It is:
 *   - a misconfigured period deletes NOTHING, rather than something,
 *   - the floor cannot be configured away,
 *   - the sweep is bounded, and says so when the backlog is not clear,
 *   - every DELETE re-asserts the tenant it touches.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  permit: vi.fn(),
  platformFindMany: vi.fn(),
  platformDeleteMany: vi.fn(),
  outcomeDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundAuditEvent: { findMany: mocks.findMany, deleteMany: mocks.deleteMany },
    platformAuditEvent: { findMany: mocks.platformFindMany, deleteMany: mocks.platformDeleteMany },
    platformAuditOutcome: { deleteMany: mocks.outcomeDeleteMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/db/tenant-guard", () => ({ permitCrossTenantReads: mocks.permit }));

import {
  DEFAULT_RETENTION_DAYS,
  enforceNorthboundAuditRetention,
  MAXIMUM_RETENTION_DAYS,
  MINIMUM_RETENTION_DAYS,
  resolveRetentionDays,
  RETENTION_BATCH_LIMIT,
} from "@/lib/northbound/retention";

const NOW = new Date("2026-09-12T00:00:00Z");

beforeEach(() => {
  mocks.findMany.mockReset();
  mocks.deleteMany.mockReset();
  mocks.permit.mockReset();
  mocks.findMany.mockResolvedValue([]);
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  mocks.platformFindMany.mockReset();
  mocks.platformDeleteMany.mockReset();
  mocks.outcomeDeleteMany.mockReset();
  mocks.transaction.mockReset();
  mocks.platformFindMany.mockResolvedValue([]);
  mocks.platformDeleteMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
  mocks.outcomeDeleteMany.mockImplementation(async ({ where }: { where: { eventId: { in: string[] } } }) => ({
    count: where.eventId.in.length,
  }));
  mocks.transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
});

describe("the configured period", () => {
  it("defaults to 30 days — the window every operations screen can query", () => {
    // opsWindowHours clamps to 24 * 30, so a row older than this is invisible to
    // every surface that reads the table. Keeping data nothing can show, on a
    // table with no bound, is the cost with no benefit.
    expect(DEFAULT_RETENTION_DAYS).toBe(30);
    expect(resolveRetentionDays(undefined)).toEqual({
      ok: true,
      days: 30,
      source: "default",
    });
    expect(resolveRetentionDays("   ")).toMatchObject({ ok: true, days: 30, source: "default" });
  });

  it("takes a valid override from the environment", () => {
    expect(resolveRetentionDays("90")).toEqual({ ok: true, days: 90, source: "environment" });
  });

  it("REFUSES rather than clamps a value below the floor", () => {
    // Clamping would leave an operator who typed 0 believing the trail is off
    // while it is on. Refusing surfaces the disagreement.
    const result = resolveRetentionDays("0");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("not a shorter");
  });

  it("refuses a value above the ceiling, so a typo cannot mean 'never delete'", () => {
    expect(resolveRetentionDays(String(MAXIMUM_RETENTION_DAYS + 1)).ok).toBe(false);
  });

  it("refuses anything that is not a whole number of days", () => {
    for (const bad of ["thirty", "30.5", "-7", ""] .filter((v) => v !== "")) {
      expect(resolveRetentionDays(bad).ok, `${bad} must be refused`).toBe(false);
    }
  });

  it("accepts the floor itself", () => {
    expect(resolveRetentionDays(String(MINIMUM_RETENTION_DAYS))).toMatchObject({ ok: true });
  });
});

describe("the sweep", () => {
  it("selects by age, oldest first, bounded by the batch cap", async () => {
    await enforceNorthboundAuditRetention(NOW, 30);
    const call = mocks.findMany.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.orderBy).toEqual({ at: "asc" });
    expect(call.take).toBe(RETENTION_BATCH_LIMIT);
    const where = call.where as { at: { lt: Date } };
    // 30 days before NOW.
    expect(where.at.lt.toISOString()).toBe("2026-08-13T00:00:00.000Z");
  });

  it("declares the cross-tenant scan rather than having the guard weakened for it", async () => {
    await enforceNorthboundAuditRetention(NOW, 30);
    expect(mocks.permit).toHaveBeenCalledWith(expect.stringContaining("northbound-retention"));
  });

  it("deletes nothing and says so when nothing is old enough", async () => {
    mocks.findMany.mockResolvedValue([]);
    const result = await enforceNorthboundAuditRetention(NOW, 30);
    expect(result).toMatchObject({ deleted: 0, moreRemaining: false, retentionDays: 30 });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes per tenant, and each DELETE re-asserts whose rows it touches", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "a1", organizationId: "org_a" },
      { id: "b1", organizationId: "org_b" },
      { id: "a2", organizationId: "org_a" },
    ]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });

    await enforceNorthboundAuditRetention(NOW, 30);

    expect(mocks.deleteMany).toHaveBeenCalledTimes(2);
    for (const [arg] of mocks.deleteMany.mock.calls) {
      const where = (arg as { where: Record<string, unknown> }).where;
      expect(where.organizationId, "every delete carries its organization").toBeTruthy();
      // Re-checked at deletion time: the scan and the delete are not one
      // transaction, and a row is only ever eligible on its own age.
      expect(where.at).toEqual({ lt: new Date("2026-08-13T00:00:00.000Z") });
    }
  });

  /*
   * UPDATED FOR AUDIT A34. This used to assert that ONE full batch ended the run
   * with moreRemaining — i.e. that the sweep's whole capacity was 5,000 rows a
   * night, below what a single polling integration writes. A full batch now
   * means "take another"; only a run that spends its time budget with full
   * batches still coming back has an uncleared backlog to report.
   */
  it("reports moreRemaining when it stops on its time budget, so a full run is not read as a clear backlog", async () => {
    mocks.findMany.mockResolvedValue(
      Array.from({ length: RETENTION_BATCH_LIMIT }, (_, i) => ({
        id: `r${i}`,
        organizationId: "org_a",
      })),
    );
    mocks.deleteMany.mockResolvedValue({ count: RETENTION_BATCH_LIMIT });
    // A zero budget: one batch, then out of time with the batch still full.
    const result = await enforceNorthboundAuditRetention(NOW, 30, RETENTION_BATCH_LIMIT, 0);
    expect(result.moreRemaining).toBe(true);
    expect(result.deleted).toBe(RETENTION_BATCH_LIMIT);
  });

  it("keeps taking batches until one comes back short, so a busy day is cleared in one run", async () => {
    // Twice the cap past the period, plus a remainder: one run clears it all.
    const batch = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, organizationId: "org_a" }));
    mocks.findMany
      .mockResolvedValueOnce(batch(RETENTION_BATCH_LIMIT, 0))
      .mockResolvedValueOnce(batch(RETENTION_BATCH_LIMIT, RETENTION_BATCH_LIMIT))
      .mockResolvedValueOnce(batch(1_234, 2 * RETENTION_BATCH_LIMIT))
      .mockResolvedValue([]);
    mocks.deleteMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({
      count: where.id.in.length,
    }));

    const result = await enforceNorthboundAuditRetention(NOW, 30);

    expect(mocks.findMany).toHaveBeenCalledTimes(3);
    expect(result.deleted).toBe(2 * RETENTION_BATCH_LIMIT + 1_234);
    expect(result.moreRemaining).toBe(false);
  });

  it("does not let the backlog outgrow the period at twice the cap a day", async () => {
    /*
     * The trigger in the audit: an integration writing 2 × the cap every day.
     * At one batch a night the oldest row aged by half a day each night, past
     * 60 days after 90 nights. A table modelled in memory, swept each night:
     * after the sweep nothing older than the period may remain. The batch is
     * scaled down to keep the table small; the ratio is what matters.
     */
    const DAY_MS = 24 * 60 * 60 * 1000;
    const LIMIT = 50;
    const perDay = 2 * LIMIT;
    let table: Array<{ id: string; organizationId: string; at: number }> = [];
    let seq = 0;
    mocks.findMany.mockImplementation(
      async ({ where, take }: { where: { at: { lt: Date } }; take: number }) =>
        table
          .filter((r) => r.at < where.at.lt.getTime())
          .sort((a, b) => a.at - b.at)
          .slice(0, take)
          .map(({ id, organizationId }) => ({ id, organizationId })),
    );
    mocks.deleteMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => {
      const doomed = new Set(where.id.in);
      const before = table.length;
      table = table.filter((r) => !doomed.has(r.id));
      return { count: before - table.length };
    });

    const start = new Date("2026-06-01T00:00:00Z").getTime();
    for (let night = 1; night <= 40; night++) {
      for (let i = 0; i < perDay; i++) {
        table.push({ id: `r${seq++}`, organizationId: "org_a", at: start + (night - 1) * DAY_MS + i });
      }
      const now = new Date(start + night * DAY_MS);
      const result = await enforceNorthboundAuditRetention(now, 30, LIMIT);
      expect(result.moreRemaining).toBe(false);
      const oldest = Math.min(...table.map((r) => r.at));
      expect(now.getTime() - oldest, `night ${night}`).toBeLessThanOrEqual(30 * DAY_MS);
    }
  });

  it("does not report moreRemaining on a partial batch", async () => {
    mocks.findMany.mockResolvedValue([{ id: "r1", organizationId: "org_a" }]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const result = await enforceNorthboundAuditRetention(NOW, 30);
    expect(result.moreRemaining).toBe(false);
    expect(result.deleted).toBe(1);
  });

  it("echoes the period and cutoff, so a run is self-describing in CronRunLog", async () => {
    const result = await enforceNorthboundAuditRetention(NOW, 45);
    expect(result.retentionDays).toBe(45);
    expect(result.cutoff).toBe("2026-07-29T00:00:00.000Z");
  });
});

/*
 * P0.14b review: since the console runs on the governed pipeline, every
 * console read also leaves a platform-scope copy in PlatformAuditEvent
 * (action SAP_CONSOLE_READ) with the reader's email and the client's tenant,
 * service and entity set. The organization's copy of the same read expires
 * here, on the period and legal basis above; the platform copy was kept
 * forever, on a table that grows by a row per console call and that no
 * screen shows. It expires with the organization's copy now. The WRITE
 * actions on that table (P0.7's fail-closed write-back trail) are never
 * touched.
 */
describe("the console's platform-scope read rows expire with the organization's", () => {
  const CUTOFF = new Date("2026-08-13T00:00:00.000Z");

  it("selects only SAP_CONSOLE_READ rows, by age, oldest first, bounded by the batch", async () => {
    await enforceNorthboundAuditRetention(NOW, 30);
    expect(mocks.platformFindMany).toHaveBeenCalledWith({
      where: { action: "SAP_CONSOLE_READ", at: { lt: CUTOFF } },
      select: { id: true },
      orderBy: { at: "asc" },
      take: RETENTION_BATCH_LIMIT,
    });
  });

  it("deletes each row's outcome and the row together, re-asserting the action and the age in both", async () => {
    mocks.platformFindMany.mockResolvedValueOnce([{ id: "e1" }, { id: "e2" }]).mockResolvedValue([]);
    const result = await enforceNorthboundAuditRetention(NOW, 30);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.outcomeDeleteMany).toHaveBeenCalledWith({
      where: { eventId: { in: ["e1", "e2"] }, event: { is: { action: "SAP_CONSOLE_READ", at: { lt: CUTOFF } } } },
    });
    expect(mocks.platformDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["e1", "e2"] }, action: "SAP_CONSOLE_READ", at: { lt: CUTOFF } },
    });
    expect(result).toMatchObject({ deleted: 0, consoleReadsDeleted: 2, moreRemaining: false });
  });

  it("keeps taking batches until one comes back short, and reports a backlog left on the time budget", async () => {
    const batch = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}` }));
    mocks.platformFindMany.mockResolvedValueOnce(batch(3)).mockResolvedValueOnce(batch(1)).mockResolvedValue([]);
    expect(await enforceNorthboundAuditRetention(NOW, 30, 3)).toMatchObject({ consoleReadsDeleted: 4, moreRemaining: false });

    mocks.platformFindMany.mockReset();
    mocks.platformFindMany.mockResolvedValue(batch(3));
    expect(await enforceNorthboundAuditRetention(NOW, 30, 3, 0)).toMatchObject({ consoleReadsDeleted: 3, moreRemaining: true });
  });

  it("does not start on them when the organization trail's sweep has already spent the budget", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 2 }, (_, i) => ({ id: `r${i}`, organizationId: "org_a" })));
    mocks.deleteMany.mockResolvedValue({ count: 2 });
    const result = await enforceNorthboundAuditRetention(NOW, 30, 2, 0);
    expect(result.moreRemaining).toBe(true);
    expect(mocks.platformFindMany).not.toHaveBeenCalled();
  });
});

describe("the append-only guarantee is unchanged", () => {
  it("this module deletes whole rows and never updates one", async () => {
    // Append-only is about INTEGRITY: no code path rewrites a recorded call to
    // say something else. Retention expires rows as a whole, on a stated
    // schedule, leaving no altered version behind. The two are compatible;
    // append-only and unbounded is just a table nobody decided about.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.resolve(process.cwd(), "src/lib/northbound/retention.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/northboundAuditEvent\.update/);
    expect(src).not.toMatch(/northboundAuditEvent\.updateMany/);
  });
});
