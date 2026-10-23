/**
 * The Operations jobs strip lists EVERY job that records a run (P0.3, A51).
 *
 * THE DEFECT. The strip's list of scheduled jobs lived in the jobs route and
 * had fallen behind vercel.json: `northbound-retention` (03:45) and
 * `lane-checks` (04:30) were scheduled and wrote CronRunLog rows, and no screen
 * read them. A retention period set out of range is refused by the cron as a
 * recorded, failed run, every night, while the audit table grows; the one
 * screen meant to show that never listed the job, so neither the failures nor
 * a missing run reached an operator.
 *
 * So the list is checked against its sources, both ways: every cron path in
 * vercel.json and every job name a cron route records must be listed, and
 * every listed job must be recorded by the route it names. A cron added later
 * without a line in SCHEDULED_JOBS fails here, not in production.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), requireOperations: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { cronRunLog: { findMany: mocks.findMany } } }));
vi.mock("@/lib/ops/guard", () => ({ requireOperations: mocks.requireOperations }));

import { GET } from "@/app/api/ops/jobs/route";
import { SCHEDULED_JOBS } from "@/lib/ops/scheduled-jobs";

const ROOT = path.resolve(__dirname, "../../..");
const CRON_DIR = path.join(ROOT, "src/app/api/cron");

const vercelCrons = (
  JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] }
).crons;

/** Every job name a cron route's own code records, by its literal. */
function recordedJobs(route: string): Set<string> {
  const src = readFileSync(path.join(CRON_DIR, route, "route.ts"), "utf8");
  const names = new Set<string>();
  for (const m of src.matchAll(/(?:recordCronRun|runWithCronLease)\(\s*"([^"]+)"/g)) names.add(m[1]!);
  return names;
}

/** "30 4 * * *" → "04:30". Every cron here is daily (the plan allows no more). */
function dailyTime(schedule: string): string {
  const [minute, hour] = schedule.split(/\s+/);
  return `${hour!.padStart(2, "0")}:${minute!.padStart(2, "0")}`;
}

describe("SCHEDULED_JOBS matches what is scheduled and recorded (A51)", () => {
  it("lists the two jobs the strip used to omit", () => {
    const jobs = SCHEDULED_JOBS.map((j) => j.job);
    expect(jobs).toContain("northbound-retention");
    expect(jobs).toContain("lane-checks");
  });

  it("names every cron vercel.json schedules, at the time it schedules it", () => {
    for (const cron of vercelCrons) {
      const route = cron.path.replace(/^\/api\/cron\//, "");
      const listed = SCHEDULED_JOBS.filter((j) => j.route === route);
      expect(listed.length, `${cron.path} is scheduled but not on the jobs strip`).toBeGreaterThan(0);
      for (const j of listed) {
        expect(j.schedule, `${j.job}'s schedule`).toContain(`daily ${dailyTime(cron.schedule)} UTC`);
      }
    }
  });

  it("lists every job name each cron route records, and nothing a route does not record", () => {
    const listed = new Set(SCHEDULED_JOBS.map((j) => j.job));
    for (const route of readdirSync(CRON_DIR)) {
      for (const job of recordedJobs(route)) {
        expect(listed.has(job), `/api/cron/${route} records "${job}", which the strip does not list`).toBe(true);
      }
    }
    for (const j of SCHEDULED_JOBS) {
      expect(recordedJobs(j.route).has(j.job), `${j.job} is listed under /api/cron/${j.route}, which never records it`).toBe(
        true,
      );
      expect(
        vercelCrons.some((c) => c.path === `/api/cron/${j.route}`),
        `${j.job} rides /api/cron/${j.route}, which vercel.json does not schedule`,
      ).toBe(true);
    }
  });
});

describe("GET /api/ops/jobs renders every scheduled job, run or not", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOperations.mockResolvedValue({ ok: true, actor: { kind: "global" } });
  });

  it("shows a failed retention run and a never-run lane sweep, rather than leaving both off the screen", async () => {
    mocks.findMany.mockResolvedValue([
      {
        job: "northbound-retention",
        startedAt: new Date("2026-10-21T03:45:00Z"),
        finishedAt: new Date("2026-10-21T03:45:01Z"),
        ok: false,
        skipped: false,
        summaryJson: { error: "NORTHBOUND_AUDIT_RETENTION_DAYS is out of range" },
      },
    ]);

    const body = (await (await GET()).json()) as {
      data: { jobs: { job: string; lastRun: { ok: boolean } | null; recentFailures: number }[] };
    };
    const byJob = new Map(body.data.jobs.map((j) => [j.job, j]));

    expect(byJob.get("northbound-retention")?.lastRun?.ok).toBe(false);
    expect(byJob.get("northbound-retention")?.recentFailures).toBe(1);
    // Listed with no run: the absence is on the screen as an absence.
    expect(byJob.has("lane-checks")).toBe(true);
    expect(byJob.get("lane-checks")?.lastRun).toBeNull();
    expect(body.data.jobs.map((j) => j.job)).toEqual(SCHEDULED_JOBS.map((j) => j.job));
  });
});
