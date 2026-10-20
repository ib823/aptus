/**
 * Job leases: one scheduled run at a time, per job (P0.18).
 *
 * WHY. Vercel can deliver the same scheduled invocation more than once, and a
 * run that goes long can still be working when another arrives. None of the
 * cron routes took a lock, so a duplicate did the whole job a second time,
 * concurrently: two sweeps upserting the same rows (where an upsert on a new
 * key can lose the insert race and fail the run), two drift alerts for one
 * broken connection, two rows in the jobs strip claiming the same work.
 *
 * HOW. One `JobLease` row per job. Claiming it is ONE statement, an
 * `INSERT … ON CONFLICT DO UPDATE … WHERE expiresAt <= now`: the insert wins
 * when no row exists, the update wins when the row has expired, and when the
 * row is live the statement changes nothing and returns nothing. Postgres
 * decides the race on the primary key, so of any number of simultaneous
 * claims exactly one returns a row. The holder deletes its row at the end.
 *
 * WHY NOT AN ADVISORY LOCK. `pg_try_advisory_lock` is held by the database
 * SESSION. Behind a pooler in transaction mode (PgBouncer, Supavisor) the
 * session belongs to the pooler, not to this run: the lock
 * outlives the run on a connection someone else is handed next, and the unlock
 * may be sent on a different connection that never held it. A row decided by
 * one statement needs no session at all.
 *
 * WHY A TTL. A function killed at its `maxDuration` never reaches its
 * `finally`, so a lease cannot rely on being released. Each lease expires on
 * its own, and the TTL is longer than any cron route is allowed to run
 * (asserted in tests/unit/ops/cron-lease-coverage.test.ts): a live run never
 * loses its lease, and a dead one blocks the job for minutes, not until the
 * next day's schedule.
 *
 * ONE CLOCK. `now()` is the DATABASE's clock, for the claim and the expiry
 * alike, so two instances whose clocks disagree still agree on whether a lease
 * has expired. Stored as UTC to match how Prisma writes every other DateTime.
 *
 * The model is deployment-wide: a job serves every tenant in one run, so a
 * lease has no organization (see the DEPLOYMENT_SCOPED_ALLOWANCES entry in
 * tests/unit/studio/studio-guard-coverage.test.ts).
 */

import { randomUUID } from "crypto";

import { prisma } from "@/lib/db/prisma";

/**
 * How long a lease holds without being released. Ten minutes: twice the 300 s
 * `maxDuration` every cron route declares, so a run cannot outlive its lease
 * however slow its last statement, and short against a daily schedule, so a
 * run that died frees its job long before the next one is due.
 */
export const JOB_LEASE_TTL_MS = 10 * 60 * 1000;

export type LeaseClaim =
  /** This invocation holds the job. `holder` is what releases it. */
  | { acquired: true; holder: string; acquiredAt: Date; expiresAt: Date }
  /**
   * Another invocation holds a live lease. Its timestamps say since when and
   * until when, or are null if it released in the moment between the refused
   * claim and the read that describes it.
   */
  | { acquired: false; heldSince: Date | null; heldUntil: Date | null };

interface LeaseRow {
  holder: string;
  acquiredAt: Date;
  expiresAt: Date;
}

/**
 * Claim the job, or learn that a live invocation already has it.
 *
 * `holder` is generated per call; tests pass their own to make takeover and
 * release observable.
 */
export async function acquireJobLease(
  job: string,
  ttlMs: number = JOB_LEASE_TTL_MS,
  holder: string = randomUUID(),
): Promise<LeaseClaim> {
  // The WHERE on DO UPDATE is the whole lease: a conflicting row is replaced
  // only once it has expired. The excluded row's acquiredAt is this
  // statement's `now()`, so "expired" is judged on the database clock.
  const claimed = await prisma.$queryRaw<LeaseRow[]>`
    INSERT INTO "JobLease" ("job", "holder", "acquiredAt", "expiresAt")
    VALUES (
      ${job},
      ${holder},
      now() AT TIME ZONE 'UTC',
      (now() AT TIME ZONE 'UTC') + (${ttlMs}::double precision * interval '1 millisecond')
    )
    ON CONFLICT ("job") DO UPDATE
      SET "holder" = EXCLUDED."holder",
          "acquiredAt" = EXCLUDED."acquiredAt",
          "expiresAt" = EXCLUDED."expiresAt"
      WHERE "JobLease"."expiresAt" <= EXCLUDED."acquiredAt"
    RETURNING "holder", "acquiredAt", "expiresAt"`;

  const won = claimed[0];
  if (won) {
    return { acquired: true, holder: won.holder, acquiredAt: won.acquiredAt, expiresAt: won.expiresAt };
  }

  // Refused. Read the live lease only to describe it in the skip record; the
  // decision is already made and this read cannot change it.
  const live = await prisma.jobLease.findUnique({
    where: { job },
    select: { acquiredAt: true, expiresAt: true },
  });
  return { acquired: false, heldSince: live?.acquiredAt ?? null, heldUntil: live?.expiresAt ?? null };
}

/**
 * Give the job back. Matches on the holder, so a run that outlived its lease
 * and was taken over cannot release the lease its successor now holds.
 *
 * Best-effort, like `recordCronRun`: a release that fails leaves a lease that
 * expires on its own, which delays a manual re-run by at most the TTL. Failing
 * the run over it would report work that succeeded as a failure.
 */
export async function releaseJobLease(job: string, holder: string): Promise<void> {
  try {
    await prisma.jobLease.deleteMany({ where: { job, holder } });
  } catch (err) {
    console.error("[job-lease] failed to release lease; it will expire on its own", { job, err });
  }
}
