/**
 * Every job that records a CronRunLog row, with when it should run — what the
 * Operations jobs strip renders, so a job that SHOULD have run and did not is
 * shown as "never run" rather than left off the screen.
 *
 * ALL OF THEM (P0.3, A51). The list lived in the jobs route and had fallen
 * behind vercel.json: `northbound-retention` and `lane-checks` were scheduled
 * and recorded their runs, and no screen read them. A retention period set out
 * of range is refused by the cron as a recorded, failed run — every night,
 * while the audit table grew — and the one screen meant to show that never
 * listed the job. tests/unit/ops/scheduled-jobs-coverage.test.ts reads
 * vercel.json and every cron route, and fails when a job is scheduled or
 * recorded without being listed here, or listed without being recorded.
 *
 * `schedule` is the vercel.json cron, in words. A job that rides another's
 * slot (one cron invocation, its own CronRunLog rows) says so.
 */

export interface ScheduledJob {
  /** The CronRunLog `job` name the cron route records. */
  readonly job: string;
  /** The cron route that runs it: `/api/cron/<route>`. */
  readonly route: string;
  readonly schedule: string;
}

export const SCHEDULED_JOBS: readonly ScheduledJob[] = [
  { job: "trials", route: "trials", schedule: "daily 02:00 UTC" },
  { job: "analytics", route: "analytics", schedule: "daily 03:00 UTC" },
  // Rides the analytics slot (daily-only cron plan); records its own runs.
  { job: "coreedge-usage", route: "analytics", schedule: "daily 03:00 UTC, after analytics" },
  { job: "northbound-reap", route: "northbound-reap", schedule: "daily 03:30 UTC" },
  // Rides the reap slot and its lease (P0.1); records its own runs.
  { job: "owner-liveness", route: "northbound-reap", schedule: "daily 03:30 UTC, after northbound-reap" },
  { job: "northbound-retention", route: "northbound-retention", schedule: "daily 03:45 UTC" },
  { job: "connection-probes", route: "connection-probes", schedule: "daily 04:00 UTC" },
  { job: "lane-checks", route: "lane-checks", schedule: "daily 04:30 UTC, after connection-probes" },
];
