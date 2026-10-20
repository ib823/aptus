/**
 * Shared machinery for scheduled jobs.
 *
 * ONE safeCompare, not four. Each cron route defined an identical private
 * constant-time compare — three copies of one security primitive, which is
 * three places for the next edit to miss one. And cron OUTCOMES lived only in
 * the HTTP response nobody stored: "did the reaper run last night?" had no
 * answer anywhere in the product while the write ledger displayed the very
 * backlog the reaper drains. `recordCronRun` is the append-only answer, and
 * the Operations home renders it as the jobs strip.
 *
 * ONE RUN AT A TIME, per job: `runWithCronLease` (P0.18). Vercel can deliver a
 * scheduled invocation twice and a long run can overlap the next; every cron
 * route does its work inside the job's lease, and an invocation that finds the
 * lease held does nothing, answers 200 and records a skip.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { acquireJobLease, JOB_LEASE_TTL_MS, releaseJobLease, type LeaseClaim } from "@/lib/ops/job-lease";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * CRON_SECRET, always, compared in constant time. False when the secret is
 * unset — a cron with no configured secret must refuse every caller rather
 * than become an open endpoint.
 */
export function authorizeCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader) return false;
  return safeCompare(authHeader, `Bearer ${cronSecret}`);
}

/** Append one run's outcome. Best-effort — a failed log must not fail the job. */
export async function recordCronRun(
  job: string,
  startedAt: Date,
  ok: boolean,
  summary: Record<string, unknown>,
  options: { skipped?: boolean } = {},
): Promise<void> {
  try {
    await prisma.cronRunLog.create({
      data: {
        job,
        startedAt,
        finishedAt: new Date(),
        ok,
        summaryJson: summary as never,
        skipped: options.skipped ?? false,
      },
    });
  } catch (err) {
    console.error("[cron-run-log] failed to record run", { job, err });
  }
}

/** What a skipped invocation says, in its response and in its CronRunLog row. */
export const LEASE_HELD = "lease held";

/**
 * Run a cron route's work inside the job's lease.
 *
 * Call it AFTER `authorizeCron`: a refused caller must not be able to take, or
 * even test for, a job's lease.
 *
 * - Lease claimed: `run` does the work and records its own outcome, as before;
 *   the lease is released however `run` ends.
 * - Lease held by a live invocation: `run` is not called. The response is 200,
 *   because nothing failed — the job is running, just not here — and the skip
 *   is recorded under `job` (and each of `alsoSkips`, the jobs that ride the
 *   same route) as an `ok`, `skipped` row, so a duplicate delivery is visible
 *   in the jobs strip instead of only in a platform log.
 * - The claim itself fails (database unreachable): nothing runs, and the run
 *   is recorded as failed. Running without the lease is exactly what the lease
 *   exists to prevent, and a job whose database is unreachable could not do
 *   its work anyway.
 */
export async function runWithCronLease(
  job: string,
  run: () => Promise<NextResponse>,
  options: { alsoSkips?: readonly string[]; ttlMs?: number } = {},
): Promise<NextResponse> {
  const startedAt = new Date();

  let claim: LeaseClaim;
  try {
    claim = await acquireJobLease(job, options.ttlMs ?? JOB_LEASE_TTL_MS);
  } catch (err) {
    await recordCronRun(job, startedAt, false, {
      error: `job lease could not be claimed: ${err instanceof Error ? err.message : "unknown error"}`,
    });
    return NextResponse.json({ error: "Job lease could not be claimed" }, { status: 500 });
  }

  if (!claim.acquired) {
    const summary = {
      skipped: LEASE_HELD,
      // When the run that holds the job started, and when its lease lapses if
      // it never releases it: enough to tell a duplicate delivery (seconds
      // apart) from a run still going since the previous schedule.
      leaseHeldSince: claim.heldSince?.toISOString() ?? null,
      leaseHeldUntil: claim.heldUntil?.toISOString() ?? null,
    };
    for (const name of [job, ...(options.alsoSkips ?? [])]) {
      await recordCronRun(name, startedAt, true, summary, { skipped: true });
    }
    return NextResponse.json({ data: { job, ...summary } });
  }

  try {
    return await run();
  } finally {
    await releaseJobLease(job, claim.holder);
  }
}
