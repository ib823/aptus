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
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    northboundAuditEvent: { findMany: mocks.findMany, deleteMany: mocks.deleteMany },
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

  it("reports moreRemaining when it hits the cap, so a full run is not read as a clear backlog", async () => {
    mocks.findMany.mockResolvedValue(
      Array.from({ length: RETENTION_BATCH_LIMIT }, (_, i) => ({
        id: `r${i}`,
        organizationId: "org_a",
      })),
    );
    mocks.deleteMany.mockResolvedValue({ count: RETENTION_BATCH_LIMIT });
    const result = await enforceNorthboundAuditRetention(NOW, 30);
    expect(result.moreRemaining).toBe(true);
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
