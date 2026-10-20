/**
 * A skipped invocation is counted, never shown as the last run (P0.18).
 *
 * An invocation turned away by the job lease finishes BEFORE the run that holds
 * the lease, so it is the newest row for that job until the holder records its
 * own. Read as "the last run", it replaced a real outcome with one that did
 * nothing. Each reader that asks "what did the last run find" skips it; the
 * jobs strip counts it, so a duplicate delivery is still visible.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  requireOperations: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { cronRunLog: { findMany: mocks.findMany, findFirst: mocks.findFirst } },
}));
vi.mock("@/lib/ops/guard", () => ({ requireOperations: mocks.requireOperations }));

import { GET } from "@/app/api/ops/jobs/route";
import { lastLaneSweep } from "@/lib/coreedge/queries";

const row = (startedAt: string, extra: { ok?: boolean; skipped?: boolean; summaryJson?: unknown } = {}) => ({
  job: "connection-probes",
  startedAt: new Date(startedAt),
  finishedAt: new Date(new Date(startedAt).getTime() + 1_000),
  ok: extra.ok ?? true,
  skipped: extra.skipped ?? false,
  summaryJson: extra.summaryJson ?? { probed: 3 },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOperations.mockResolvedValue({ ok: true, actor: { kind: "global" } });
});

describe("GET /api/ops/jobs", () => {
  it("reports the newest REAL run as the last run, and counts the skip beside it", async () => {
    mocks.findMany.mockResolvedValue([
      // Newest first, as the query orders them: the duplicate started a moment after the run.
      row("2026-10-21T04:00:02Z", { skipped: true, summaryJson: { skipped: "lease held" } }),
      row("2026-10-21T04:00:00Z", { summaryJson: { probed: 7 } }),
      row("2026-10-20T04:00:00Z", { ok: false }),
    ]);

    const body = (await (await GET()).json()) as {
      data: { jobs: { job: string; lastRun: { summary: unknown } | null; runsRecorded: number; recentFailures: number; recentSkips: number }[] };
    };
    const probes = body.data.jobs.find((j) => j.job === "connection-probes")!;

    expect(probes.lastRun?.summary).toEqual({ probed: 7 });
    expect(probes.runsRecorded).toBe(2);
    expect(probes.recentFailures).toBe(1);
    expect(probes.recentSkips).toBe(1);
    // A job with no skips says so with a zero, not an absence.
    expect(body.data.jobs.find((j) => j.job === "trials")?.recentSkips).toBe(0);
  });
});

describe("lastLaneSweep", () => {
  it("asks for the newest sweep that was not a skip", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await lastLaneSweep();
    expect(mocks.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { job: "lane-checks", skipped: false } });
  });
});
