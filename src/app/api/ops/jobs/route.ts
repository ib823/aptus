/**
 * GET /api/ops/jobs — did the scheduled jobs actually run?
 *
 * Cron outcomes used to live only in the HTTP response Vercel discarded, so
 * "did the reaper run last night?" had no answer anywhere in the product. Every
 * cron route now records a CronRunLog row; this endpoint reads the latest per
 * job, plus a short history, so a missing sweep is visible as an absence.
 *
 * DEPLOYMENT-WIDE ON PURPOSE. CronRunLog has no organization column because a
 * sweep serves every tenant at once — scoping it would return nothing for
 * every organization while appearing to work. What a scoped operator learns
 * here is only that the platform's jobs ran and whether they succeeded; the
 * summaries are aggregate counts and never name a tenant, a connection or a
 * credential.
 */

import { prisma } from "@/lib/db/prisma";
import { requireOperations } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

/**
 * The jobs vercel.json schedules, with their cadence — mirrored here so the
 * screen can render "never run" for a job that SHOULD have run, rather than
 * only listing jobs that happen to have rows.
 */
const SCHEDULED_JOBS = [
  { job: "trials", schedule: "daily 02:00 UTC" },
  { job: "analytics", schedule: "daily 03:00 UTC" },
  { job: "northbound-reap", schedule: "daily 03:30 UTC" },
  { job: "connection-probes", schedule: "daily 04:00 UTC" },
] as const;

const HISTORY_PER_JOB = 10;

export async function GET() {
  const guard = await requireOperations();
  if (!guard.ok) return guard.response;

  // Newest rows per job. One bounded query, split in memory — with four jobs
  // and a ten-row history each, this reads at most a few dozen rows.
  const rows = await prisma.cronRunLog.findMany({
    orderBy: { startedAt: "desc" },
    take: SCHEDULED_JOBS.length * HISTORY_PER_JOB * 2,
    select: { job: true, startedAt: true, finishedAt: true, ok: true, summaryJson: true },
  });

  const byJob = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byJob.get(row.job) ?? [];
    if (list.length < HISTORY_PER_JOB) list.push(row);
    byJob.set(row.job, list);
  }

  return studioOk({
    scope: guard.actor.kind,
    jobs: SCHEDULED_JOBS.map(({ job, schedule }) => {
      const history = byJob.get(job) ?? [];
      const latest = history[0] ?? null;
      return {
        job,
        schedule,
        // Null when the job has never recorded a run — an absence the screen
        // renders as such, never as a failure and never as a pass.
        lastRun: latest
          ? {
              startedAt: latest.startedAt.toISOString(),
              finishedAt: latest.finishedAt.toISOString(),
              durationMs: latest.finishedAt.getTime() - latest.startedAt.getTime(),
              ok: latest.ok,
              summary: latest.summaryJson ?? null,
            }
          : null,
        recentFailures: history.filter((h) => !h.ok).length,
        runsRecorded: history.length,
      };
    }),
    provenance: {
      deploymentWide:
        "Scheduled jobs serve every tenant in one run, so this feed is deployment-wide — the one deliberate exception to this workspace's per-organization scoping. Summaries are aggregate counts and never name a tenant.",
      recordingStartsAtDeploy:
        "Runs are recorded from the release that introduced the log. A job with no rows has not run SINCE THEN — that is an absence of a record, not proof the job never ran before it.",
      historyPerJob: HISTORY_PER_JOB,
    },
  });
}
