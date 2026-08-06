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
 */

import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";

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
): Promise<void> {
  try {
    await prisma.cronRunLog.create({
      data: {
        job,
        startedAt,
        finishedAt: new Date(),
        ok,
        summaryJson: summary as never,
      },
    });
  } catch (err) {
    console.error("[cron-run-log] failed to record run", { job, err });
  }
}
