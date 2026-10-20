/**
 * Every scheduled job runs inside its lease (P0.18), checked two ways.
 *
 * 1. STRUCTURE. A cron route added later without the lease would run twice on
 *    a duplicate delivery, and nothing else would notice. So the routes are
 *    read from the file that decides what runs (vercel.json), and each must
 *    claim the lease under its own job name, after the secret gate, with a
 *    stated maxDuration the lease's TTL outlasts. A lease that can expire
 *    while its holder is still running admits a second run, which is the
 *    failure the lease exists to prevent.
 *
 * 2. THE WRAPPER'S THREE OUTCOMES, without a database: a held lease answers
 *    200 and records a skip; a claim that fails runs nothing and records a
 *    failure; a claimed lease is released however the work ends.
 *    tests/integration/cron-job-leases.test.ts proves the same against real
 *    PostgreSQL contention.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
  createRun: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { cronRunLog: { create: mocks.createRun } } }));
vi.mock("@/lib/ops/job-lease", () => ({
  JOB_LEASE_TTL_MS: 600_000,
  acquireJobLease: mocks.acquire,
  releaseJobLease: mocks.release,
}));

import { LEASE_HELD, runWithCronLease } from "@/lib/ops/cron";

const CRON_DIR = path.resolve(process.cwd(), "src/app/api/cron");

interface CronEntry {
  readonly path: string;
  readonly schedule: string;
}

const scheduled = (): readonly CronEntry[] =>
  (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: CronEntry[] }).crons;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return name === "route.ts" ? [p] : [];
  });
}

describe("every scheduled job claims its lease", () => {
  // Read through the real module's source, not the mock above: the TTL a route
  // is held to is the one production uses.
  const ttlSource = readFileSync(path.resolve(process.cwd(), "src/lib/ops/job-lease.ts"), "utf8");
  const ttlMatch = /export const JOB_LEASE_TTL_MS = ([\d\s*_]+);/.exec(ttlSource);
  const ttlMs = ttlMatch ? Number(Function(`return ${ttlMatch[1]!.replace(/_/g, "")}`)()) : NaN;

  it("reads the lease TTL (guard against a dead guard)", () => {
    expect(ttlMs).toBe(10 * 60 * 1000);
  });

  it("schedules all six cron routes, and has no cron route vercel.json does not run", () => {
    const fromSchedule = scheduled().map((c) => path.resolve(process.cwd(), `src/app${c.path}/route.ts`));
    expect(fromSchedule).toHaveLength(6);
    expect([...routeFiles(CRON_DIR)].sort()).toEqual([...fromSchedule].sort());
  });

  it.each(scheduled().map((c) => [c.path] as const))("%s runs inside the lease, after the secret gate", (cronPath) => {
    const job = cronPath.split("/").pop()!;
    const src = readFileSync(path.resolve(process.cwd(), `src/app${cronPath}/route.ts`), "utf8");

    // Under the job name the route records its runs under, so the skip lands
    // in the same row history the jobs strip reads.
    const claim = src.indexOf(`runWithCronLease("${job}"`);
    expect(claim, `${cronPath} does not claim the "${job}" lease`).toBeGreaterThan(-1);
    expect(src).toContain(`recordCronRun("${job}"`);

    // A refused caller must not be able to take, or probe for, the lease.
    const gate = src.indexOf("authorizeCron(request)");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(claim);
  });

  it.each(scheduled().map((c) => [c.path] as const))("%s cannot outlive its lease", (cronPath) => {
    const src = readFileSync(path.resolve(process.cwd(), `src/app${cronPath}/route.ts`), "utf8");
    const declared = /export const maxDuration = (\d+);/.exec(src);
    // Unstated, the ceiling is whatever the platform default is that year.
    expect(declared, `${cronPath} must state its maxDuration`).not.toBeNull();
    expect(Number(declared![1]) * 1000).toBeLessThan(ttlMs);
  });
});

describe("runWithCronLease", () => {
  const LEASE = {
    acquired: true as const,
    holder: "holder-1",
    acquiredAt: new Date("2026-10-21T03:00:00Z"),
    expiresAt: new Date("2026-10-21T03:10:00Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRun.mockResolvedValue({});
    mocks.release.mockResolvedValue(undefined);
  });

  it("runs the work under a claimed lease, then releases it", async () => {
    mocks.acquire.mockResolvedValue(LEASE);
    const run = vi.fn(async () => NextResponse.json({ data: { done: true } }));

    const res = await runWithCronLease("trials", run);
    expect(await res.json()).toEqual({ data: { done: true } });
    expect(run).toHaveBeenCalledTimes(1);
    expect(mocks.release).toHaveBeenCalledWith("trials", "holder-1");
  });

  it("releases the lease when the work throws, and lets the error through", async () => {
    mocks.acquire.mockResolvedValue(LEASE);
    await expect(
      runWithCronLease("trials", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(mocks.release).toHaveBeenCalledWith("trials", "holder-1");
  });

  it("answers 200 with a skip and records it, without running, when the lease is held", async () => {
    mocks.acquire.mockResolvedValue({
      acquired: false,
      heldSince: new Date("2026-10-21T03:00:00Z"),
      heldUntil: new Date("2026-10-21T03:10:00Z"),
    });
    const run = vi.fn();

    const res = await runWithCronLease("analytics", run, { alsoSkips: ["coreedge-usage"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: {
        job: "analytics",
        skipped: LEASE_HELD,
        leaseHeldSince: "2026-10-21T03:00:00.000Z",
        leaseHeldUntil: "2026-10-21T03:10:00.000Z",
      },
    });
    expect(run).not.toHaveBeenCalled();
    // A skip holds nothing, so it releases nothing.
    expect(mocks.release).not.toHaveBeenCalled();

    const recorded = mocks.createRun.mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data);
    expect(recorded.map((d) => d.job)).toEqual(["analytics", "coreedge-usage"]);
    for (const d of recorded) {
      // ok: a duplicate delivery is not a failure of the job.
      expect(d).toMatchObject({ ok: true, skipped: true, summaryJson: { skipped: LEASE_HELD } });
    }
  });

  it("runs nothing and records a failure when the lease cannot be claimed", async () => {
    mocks.acquire.mockRejectedValue(new Error("connection refused"));
    const run = vi.fn();

    const res = await runWithCronLease("lane-checks", run);
    expect(res.status).toBe(500);
    expect(run).not.toHaveBeenCalled();
    const { data } = mocks.createRun.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ job: "lane-checks", ok: false, skipped: false });
    expect((data.summaryJson as { error: string }).error).toContain("connection refused");
  });

  it("records a real run as not skipped", async () => {
    const { recordCronRun } = await import("@/lib/ops/cron");
    await recordCronRun("trials", new Date(), true, { trialsExpired: 1 });
    expect((mocks.createRun.mock.calls[0]![0] as { data: Record<string, unknown> }).data.skipped).toBe(false);
  });
});
