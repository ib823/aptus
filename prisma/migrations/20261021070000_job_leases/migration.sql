-- Job leases for scheduled jobs (P0.18).
--
-- Vercel can deliver one scheduled run more than once, and a long run can still
-- be going when the next invocation arrives. None of the six crons took a lock,
-- so two invocations did the work twice: two sweeps contending for the same
-- rows, two drift alerts for one broken connection. A JobLease row is claimed
-- with one conditional INSERT ... ON CONFLICT DO UPDATE, so exactly one
-- invocation runs and any other records a skip.
--
-- CronRunLog.skipped marks that skip, so a duplicate invocation is visible in
-- the jobs strip and is never read as "the last run found nothing".
--
-- Generated with `prisma migrate diff`. Additive: the running code never reads
-- JobLease, and its CronRunLog inserts omit `skipped`, which defaults to false.
-- That default is also true of every existing row: no run before this release
-- could have been skipped.
--
-- Backout: DROP TABLE "JobLease"; ALTER TABLE "CronRunLog" DROP COLUMN "skipped";

-- AlterTable
ALTER TABLE "CronRunLog" ADD COLUMN     "skipped" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "JobLease" (
    "job" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("job")
);
