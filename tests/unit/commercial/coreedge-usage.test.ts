/**
 * The commercial split's engineering half.
 *
 * 1. SUBSCRIPTIONS RESOLVE PER PRODUCT LINE, and no line inherits another:
 *    a Workbench plan must never silently make an organization a CoreEdge
 *    customer — that would be a pricing decision nobody took.
 * 2. THE ROLLUP IS IDEMPOTENT AND BOUNDED: re-running a day upserts the same
 *    row, and the backfill fills at most its cap per run, reporting the rest
 *    as remaining rather than scanning history unboundedly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orgFindUnique: vi.fn(),
  subFindUnique: vi.fn(),
  auditGroupBy: vi.fn(),
  auditFindFirst: vi.fn(),
  rollupUpsert: vi.fn(),
  rollupFindMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: { findUnique: mocks.orgFindUnique },
    subscription: { findUnique: mocks.subFindUnique },
    northboundAuditEvent: { groupBy: mocks.auditGroupBy, findFirst: mocks.auditFindFirst },
    coreEdgeUsageRollup: { upsert: mocks.rollupUpsert, findMany: mocks.rollupFindMany },
  },
}));

import { getSubscription } from "@/lib/commercial/subscriptions";
import { rollupDay, runCoreEdgeUsageRollup, ROLLUP_BACKFILL_LIMIT } from "@/lib/commercial/coreedge-usage";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditGroupBy.mockResolvedValue([]);
  mocks.rollupUpsert.mockResolvedValue({});
  mocks.rollupFindMany.mockResolvedValue([]);
});

describe("getSubscription — one answer per product line", () => {
  it("WORKBENCH derives from the Organization columns, the compatibility read", async () => {
    mocks.orgFindUnique.mockResolvedValue({
      plan: "PROFESSIONAL",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
    });
    const s = await getSubscription("org-1", "WORKBENCH");
    expect(s).toMatchObject({ plan: "PROFESSIONAL", status: "ACTIVE", source: "organization" });
    expect(mocks.subFindUnique).not.toHaveBeenCalled();
  });

  it("COREEDGE resolves from the Subscription table, never the Workbench plan", async () => {
    mocks.subFindUnique.mockResolvedValue({ plan: "COREEDGE_STANDARD", status: "ACTIVE", endsAt: null });
    const s = await getSubscription("org-1", "COREEDGE");
    expect(s).toMatchObject({ plan: "COREEDGE_STANDARD", source: "subscription" });
    expect(mocks.orgFindUnique).not.toHaveBeenCalled();
  });

  it("no COREEDGE row means NO subscription — reported, not inherited", async () => {
    mocks.subFindUnique.mockResolvedValue(null);
    const s = await getSubscription("org-1", "COREEDGE");
    expect(s).toMatchObject({ plan: "NONE", status: "NONE", source: "none" });
  });
});

describe("rollupDay — one bounded upsert per organization", () => {
  it("aggregates the day's groups into one row per organization, keyed for idempotency", async () => {
    mocks.auditGroupBy.mockImplementation((args: { by: string[]; where?: { operation?: unknown; status?: unknown } }) => {
      if (args.by.length === 2) return Promise.resolve([]); // distinct interface/credential pairs
      if (args.where?.operation === "READ") {
        return Promise.resolve([{ organizationId: "org-1", _sum: { rowCount: 120 } }]);
      }
      if (args.where && "operation" in args.where && args.where.operation !== "READ") {
        return Promise.resolve([{ organizationId: "org-1", _count: { _all: 2 } }]);
      }
      if (args.where?.status && typeof args.where.status === "object" && "in" in (args.where.status as object)) {
        return Promise.resolve([{ organizationId: "org-1", _count: { _all: 1 } }]);
      }
      return Promise.resolve([{ organizationId: "org-1", _count: { _all: 10 } }]);
    });

    const written = await rollupDay(new Date("2026-08-05T13:45:00Z"));
    expect(written).toBe(1);

    const upsert = mocks.rollupUpsert.mock.calls[0]?.[0] as {
      where: { organizationId_day: { organizationId: string; day: Date } };
      create: Record<string, unknown>;
    };
    // Keyed to UTC midnight — the idempotency anchor.
    expect(upsert.where.organizationId_day.day.toISOString()).toBe("2026-08-05T00:00:00.000Z");
    expect(upsert.create).toMatchObject({ calls: 10, rowsRead: 120, writes: 2, refusals: 1 });
  });
});

describe("runCoreEdgeUsageRollup — bounded backfill", () => {
  it("does nothing when no audit rows exist at all", async () => {
    mocks.auditFindFirst.mockResolvedValue(null);
    const r = await runCoreEdgeUsageRollup(new Date("2026-08-06T04:00:00Z"));
    expect(r).toEqual({ daysProcessed: 0, rowsWritten: 0, moreRemaining: false });
  });

  it("caps a deep backlog at the limit and says more remains", async () => {
    // A year of history, nothing rolled up yet.
    mocks.auditFindFirst.mockResolvedValue({ at: new Date("2025-08-06T00:00:00Z") });
    const r = await runCoreEdgeUsageRollup(new Date("2026-08-06T04:00:00Z"));
    expect(r.daysProcessed).toBe(ROLLUP_BACKFILL_LIMIT);
    expect(r.moreRemaining).toBe(true);
  });

  it("skips already-rolled days but always re-runs yesterday", async () => {
    mocks.auditFindFirst.mockResolvedValue({ at: new Date("2026-08-01T00:00:00Z") });
    mocks.rollupFindMany.mockResolvedValue([
      { day: new Date("2026-08-05T00:00:00Z") }, // yesterday — already rolled
      { day: new Date("2026-08-03T00:00:00Z") },
    ]);
    const r = await runCoreEdgeUsageRollup(new Date("2026-08-06T04:00:00Z"));
    // Yesterday (re-run despite existing: late audit writes converge), plus
    // the missing 04, 02, 01 — the rolled 03 is skipped.
    expect(r.daysProcessed).toBe(4);
  });
});
