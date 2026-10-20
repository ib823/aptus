// @vitest-environment node
/**
 * Job leases against real PostgreSQL contention (P0.18).
 *
 * Vercel can deliver one scheduled invocation twice, and a long run can overlap
 * the next. Every cron route now does its work inside the job's lease. What is
 * proved here, against a real database, for each of the six routes:
 *
 * 1. TWO CONCURRENT INVOCATIONS DO THE WORK ONCE. The work is held open on a
 *    gate until the other invocation has answered, so the two genuinely
 *    overlap; without the lease both reach the work and the gate never sees a
 *    skip. The loser answers 200 with "lease held" and leaves a skipped row in
 *    CronRunLog; the winner records its run and releases the lease.
 * 2. AN EXPIRED LEASE IS TAKEN OVER, and a live one is respected.
 * 3. THE CLAIM ITSELF: of 24 simultaneous claims exactly one wins, on a fresh
 *    job and on an expired lease; a superseded holder cannot release its
 *    successor's lease.
 *
 * The sweeps are mocked (their own idempotency is in
 * cron-sweep-idempotency.test.ts); the lease, the run log and every query that
 * decides who runs are real.
 */

import { randomUUID } from "node:crypto";
import { NextRequest, type NextResponse } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as RetentionModule from "@/lib/northbound/retention";

const work = vi.hoisted(() => ({
  analytics: vi.fn(),
  usage: vi.fn(),
  reap: vi.fn(),
  retention: vi.fn(),
  trials: vi.fn(),
  probes: vi.fn(),
  lanes: vi.fn(),
  owners: vi.fn(),
}));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});
vi.mock("@/lib/analytics/nightly-job", () => ({ runNightlyAnalytics: work.analytics }));
vi.mock("@/lib/commercial/coreedge-usage", () => ({ runCoreEdgeUsageRollup: work.usage }));
vi.mock("@/lib/northbound/reap", () => ({ reapExpiredIdempotencyKeys: work.reap }));
// Rides the reap route (P0.1); stubbed so it never sweeps other files' rows.
vi.mock("@/lib/studio/owner-liveness", () => ({ sweepOwnerLiveness: work.owners }));
vi.mock("@/lib/northbound/retention", async (importOriginal) => ({
  ...(await importOriginal<typeof RetentionModule>()),
  enforceNorthboundAuditRetention: work.retention,
}));
vi.mock("@/lib/commercial/trial-manager", () => ({ checkAndExpireTrials: work.trials }));
vi.mock("@/lib/ops/connection-probe-sweep", () => ({ sweepConnectionProbes: work.probes }));
vi.mock("@/lib/ops/lane-check-sweep", () => ({ sweepLaneChecks: work.lanes }));

import { prisma } from "@/lib/db/prisma";
import { acquireJobLease, releaseJobLease } from "@/lib/ops/job-lease";
import { GET as analyticsRoute } from "@/app/api/cron/analytics/route";
import { GET as probesRoute } from "@/app/api/cron/connection-probes/route";
import { GET as laneChecksRoute } from "@/app/api/cron/lane-checks/route";
import { GET as reapRoute } from "@/app/api/cron/northbound-reap/route";
import { GET as retentionRoute } from "@/app/api/cron/northbound-retention/route";
import { GET as trialsRoute } from "@/app/api/cron/trials/route";

const SECRET = "lease-test-cron-secret";

type Route = (request: NextRequest) => Promise<NextResponse>;

interface Cron {
  readonly job: string;
  readonly route: Route;
  readonly work: ReturnType<typeof vi.fn>;
  /** What the mocked sweep resolves with — the shape its route reads. */
  readonly result: unknown;
}

/** The six routes vercel.json schedules, each with the job name it records under. */
const CRONS: readonly Cron[] = [
  {
    job: "analytics",
    route: analyticsRoute,
    work: work.analytics,
    result: { benchmarksUpdated: 1, portfolioMetricsUpdated: 6, errors: [] },
  },
  {
    job: "northbound-reap",
    route: reapRoute,
    work: work.reap,
    result: { deleted: 4, moreRemaining: false },
  },
  {
    job: "northbound-retention",
    route: retentionRoute,
    work: work.retention,
    result: { deleted: 9, moreRemaining: false, retentionDays: 30, cutoff: "2026-09-20T03:45:00.000Z" },
  },
  { job: "trials", route: trialsRoute, work: work.trials, result: 2 },
  {
    job: "connection-probes",
    route: probesRoute,
    work: work.probes,
    result: { probed: 1, skippedNoPath: 0, unreadable: 0, byStatus: { OK: 1 }, transitions: [], alertsSent: 0 },
  },
  {
    job: "lane-checks",
    route: laneChecksRoute,
    work: work.lanes,
    result: {
      checked: 1,
      skippedNoConnection: 0,
      skippedNoEntitySet: 0,
      skippedNoService: 0,
      unreadable: 0,
      byReadStatus: { OK: 1 },
    },
  },
];

const JOBS = [...CRONS.map((c) => c.job), "coreedge-usage", "owner-liveness"];

const call = (route: Route, headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) =>
  route(new NextRequest("http://localhost/api/cron/test", { headers }));

/** A promise the test opens by hand, so a run can be held mid-work. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

// Opt in explicitly; never fall back to an application's DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("cron job leases with real PostgreSQL contention", () => {
  const suiteStart = new Date();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("NORTHBOUND_AUDIT_RETENTION_DAYS", "");
    work.usage.mockResolvedValue({ daysProcessed: 1, rowsWritten: 1, moreRemaining: false });
    work.owners.mockResolvedValue({ checked: 0, restricted: 0, skipped: 0 });
    await prisma.jobLease.deleteMany({ where: { job: { in: JOBS } } });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.jobLease.deleteMany({ where: { job: { in: JOBS } } });
    await prisma.jobLease.deleteMany({ where: { job: { startsWith: "lease-test-" } } });
    await prisma.cronRunLog.deleteMany({ where: { job: { in: JOBS }, startedAt: { gte: suiteStart } } });
    await prisma.$disconnect();
  });

  describe.each(CRONS)("$job", ({ job, route, work: sweep, result }) => {
    it("does the work once when two invocations arrive together", async () => {
      const since = new Date();
      const held = gate();
      sweep.mockImplementation(async () => {
        await held.opened;
        return result;
      });

      const both = Promise.all([call(route), call(route)]);
      try {
        // The loser is turned away while the winner is still inside the work.
        // Without a lease both are inside, nobody skips, and this times out.
        await vi.waitFor(
          async () => {
            const skips = await prisma.cronRunLog.count({ where: { job, skipped: true, startedAt: { gte: since } } });
            expect(skips).toBe(1);
          },
          { timeout: 5_000, interval: 20 },
        );
      } finally {
        held.open();
      }
      const responses = await both;

      expect(sweep).toHaveBeenCalledTimes(1);
      // A skip is not a failure: both answer 200, and exactly one says why it did nothing.
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      const bodies = (await Promise.all(responses.map((r) => r.json()))) as { data: Record<string, unknown> }[];
      expect(bodies.filter((b) => b.data.skipped === "lease held")).toHaveLength(1);

      const rows = await prisma.cronRunLog.findMany({ where: { job, startedAt: { gte: since } } });
      const skip = rows.find((r) => r.skipped);
      expect(rows.filter((r) => !r.skipped)).toHaveLength(1);
      expect(skip?.ok).toBe(true);
      expect(skip?.summaryJson).toMatchObject({ skipped: "lease held" });
      expect((skip?.summaryJson as { leaseHeldSince: string | null }).leaseHeldSince).not.toBeNull();

      // Released at the end, so the next schedule — or a manual re-run — can claim it.
      expect(await prisma.jobLease.findUnique({ where: { job } })).toBeNull();
    });

    it("takes over a lease whose holder died without releasing it", async () => {
      await prisma.jobLease.create({
        data: {
          job,
          holder: "killed-at-max-duration",
          acquiredAt: new Date(Date.now() - 30 * 60_000),
          expiresAt: new Date(Date.now() - 20 * 60_000),
        },
      });
      sweep.mockResolvedValue(result);

      const res = await call(route);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { data: Record<string, unknown> }).data.skipped).toBeUndefined();
      expect(sweep).toHaveBeenCalledTimes(1);
      expect(await prisma.jobLease.findUnique({ where: { job } })).toBeNull();
    });

    it("respects a live lease, and leaves it with its holder", async () => {
      const acquiredAt = new Date(Date.now() - 60_000);
      await prisma.jobLease.create({
        data: { job, holder: "still-running", acquiredAt, expiresAt: new Date(Date.now() + 5 * 60_000) },
      });

      const res = await call(route);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { data: Record<string, unknown> }).data.skipped).toBe("lease held");
      expect(sweep).not.toHaveBeenCalled();
      // The skip must not release a lease it never held.
      expect((await prisma.jobLease.findUnique({ where: { job } }))?.holder).toBe("still-running");
    });

    it("refuses an unauthenticated caller before touching the lease", async () => {
      const since = new Date();
      expect((await call(route, {})).status).toBe(401);
      expect(await prisma.jobLease.findUnique({ where: { job } })).toBeNull();
      expect(await prisma.cronRunLog.count({ where: { job, startedAt: { gte: since } } })).toBe(0);
    });
  });

  it("records a skipped reap invocation under the owner sweep that rides it too (P0.1)", async () => {
    const since = new Date();
    await prisma.jobLease.create({
      data: { job: "northbound-reap", holder: "still-running", acquiredAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
    });
    await call(reapRoute);
    expect(work.owners).not.toHaveBeenCalled();
    const skips = await prisma.cronRunLog.findMany({
      where: { skipped: true, startedAt: { gte: since }, job: { in: ["northbound-reap", "owner-liveness"] } },
    });
    expect(skips.map((s) => s.job).sort()).toEqual(["northbound-reap", "owner-liveness"]);
  });

  it("records a skipped analytics invocation under the usage rollup that rides it too", async () => {
    const since = new Date();
    await prisma.jobLease.create({
      data: { job: "analytics", holder: "still-running", acquiredAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
    });
    await call(analyticsRoute);
    expect(work.usage).not.toHaveBeenCalled();
    const skips = await prisma.cronRunLog.findMany({ where: { skipped: true, startedAt: { gte: since } } });
    expect(skips.map((s) => s.job).sort()).toEqual(["analytics", "coreedge-usage"]);
  });

  it("holds the lease while the work runs, and releases it when the work throws", async () => {
    let heldDuringWork: unknown = null;
    work.trials.mockImplementation(async () => {
      heldDuringWork = await prisma.jobLease.findUnique({ where: { job: "trials" } });
      throw new Error("database is on fire");
    });
    await expect(call(trialsRoute)).rejects.toThrow("database is on fire");
    expect(heldDuringWork).not.toBeNull();
    expect(await prisma.jobLease.findUnique({ where: { job: "trials" } })).toBeNull();
  });

  describe("the claim", () => {
    it.each(["fresh", "expired"] as const)("admits exactly one of 24 simultaneous claims on a %s job", async (state) => {
      const job = `lease-test-${randomUUID()}`;
      if (state === "expired") {
        await prisma.jobLease.create({
          data: { job, holder: "dead", acquiredAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() - 1_000) },
        });
      }
      const claims = await Promise.all(Array.from({ length: 24 }, () => acquireJobLease(job)));
      const winners = claims.filter((c) => c.acquired);
      expect(winners).toHaveLength(1);
      const winner = winners[0];
      if (!winner?.acquired) throw new Error("no winner");
      expect((await prisma.jobLease.findUnique({ where: { job } }))?.holder).toBe(winner.holder);
      // Every loser can say who it lost to, for the skip record.
      for (const loser of claims.filter((c) => !c.acquired)) {
        if (loser.acquired) continue;
        expect(loser.heldSince?.getTime()).toBe(winner.acquiredAt.getTime());
        expect(loser.heldUntil?.getTime()).toBe(winner.expiresAt.getTime());
      }
    });

    it("expires a lease on the database clock after its TTL", async () => {
      const job = `lease-test-${randomUUID()}`;
      const first = await acquireJobLease(job, 60_000);
      if (!first.acquired) throw new Error("first claim refused");
      expect(first.expiresAt.getTime() - first.acquiredAt.getTime()).toBe(60_000);
      expect((await acquireJobLease(job)).acquired).toBe(false);
    });

    it("does not let a superseded holder release its successor's lease", async () => {
      const job = `lease-test-${randomUUID()}`;
      await prisma.jobLease.create({
        data: { job, holder: "outlived-its-lease", acquiredAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() - 1_000) },
      });
      const successor = await acquireJobLease(job);
      if (!successor.acquired) throw new Error("takeover refused");

      // The old run finally reaches its `finally`.
      await releaseJobLease(job, "outlived-its-lease");
      expect((await prisma.jobLease.findUnique({ where: { job } }))?.holder).toBe(successor.holder);
      expect((await acquireJobLease(job)).acquired).toBe(false);

      await releaseJobLease(job, successor.holder);
      expect(await prisma.jobLease.findUnique({ where: { job } })).toBeNull();
    });
  });
});
