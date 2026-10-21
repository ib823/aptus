/**
 * EACH ORGANISATION'S CONTRACT COMPILER TIME, PER UTC DAY (P1.3).
 *
 * A builder with a free BTP trial can serve any description and any sampled
 * rows, and every job the compiler runs for them costs the deployment CPU
 * (the Hobby plan's 4 CPU-hours a month pause every function once spent). So
 * the wall time of an organisation's worker jobs — verify, capture, fixture,
 * starter kit and solution document alike, from the worker's spawn to its
 * exit, a job killed at its deadline or heap included — is added up per UTC
 * day in Postgres, and a job of an organisation that has used
 * COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY is refused before it is queued.
 *
 * Only the organisation's own time: there is no deployment-wide sum, so no
 * tenant can spend another's. Read paths (/schema) never touch it.
 */

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/** The default allowance: 40 s of worker wall time a day, about 400 jobs of a real service. */
export const DEFAULT_CONTRACT_SECONDS_PER_ORG_DAY = 40;

/** The allowance in seconds; 0 means unlimited (COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY). */
export function contractSecondsPerOrgDay(): number {
  const raw = process.env.COREEDGE_CONTRACT_SECONDS_PER_ORG_DAY?.trim();
  return raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : DEFAULT_CONTRACT_SECONDS_PER_ORG_DAY;
}

const utcDay = (now: Date) => now.toISOString().slice(0, 10);

/** The next 00:00 UTC after `now`. */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export type ContractTimeCheck = { ok: true } | { ok: false; detail: string; retryAfterMs: number };

/** Whether the organisation may start a job now: refused once it has used today's allowance. */
export async function checkContractTime(organizationId: string, now: Date = new Date()): Promise<ContractTimeCheck> {
  const seconds = contractSecondsPerOrgDay();
  if (seconds === 0) return { ok: true };
  const rows = await prisma.$queryRaw<{ ms: number }[]>(Prisma.sql`
    SELECT "ms" FROM "ContractTime" WHERE "organizationId" = ${organizationId} AND "day" = ${utcDay(now)}::date
  `);
  if ((rows[0]?.ms ?? 0) < seconds * 1000) return { ok: true };
  return {
    ok: false,
    detail: `your organisation has used its ${seconds} s of contract compile time for today. It is available again at 00:00 UTC.`,
    retryAfterMs: nextUtcMidnight(now).getTime() - now.getTime(),
  };
}

/** Rows older than this many days are deleted by a charge. */
const KEEP_DAYS = 7;
let prunedAt = 0;

/** Add a job's wall time to the organisation's day. Never throws: a charge that fails is logged. */
export async function chargeContractTime(organizationId: string, wallMs: number, now: Date = new Date()): Promise<void> {
  const ms = Math.max(0, Math.min(2_000_000_000, Math.round(wallMs)));
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ContractTime" ("organizationId", "day", "ms") VALUES (${organizationId}, ${utcDay(now)}::date, ${ms})
      ON CONFLICT ("organizationId", "day") DO UPDATE SET "ms" = LEAST("ContractTime"."ms"::bigint + EXCLUDED."ms", 2000000000)::int
    `);
    // At most once an hour per process.
    if (now.getTime() - prunedAt >= 3_600_000) {
      prunedAt = now.getTime();
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "ContractTime" WHERE "day" < ${utcDay(now)}::date - ${KEEP_DAYS}::int`);
    }
  } catch (err) {
    console.error("[contracts] compile time not charged", { error: err instanceof Error ? err.name : "unknown" });
  }
}
