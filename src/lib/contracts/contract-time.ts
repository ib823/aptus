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
 * RESERVED BEFORE IT RUNS, SETTLED AFTER (consolidated review round 2). The
 * gate is per process, and a Fluid deployment runs several (at least one per
 * function group), so a check that only read the row let every instance
 * admit its own queue of jobs for an organisation already at its cap. A job
 * therefore reserves its deadline on the row in the same statement that
 * checks it (reserveContractTime), once it holds its slot in the gate, and
 * settles to its real wall time once its worker has gone (chargeContractTime
 * with what it reserved). A process holds at most one reservation per
 * organisation (the gate runs one job of an organisation at a time, and a
 * job settles before it frees its slot: consolidated containment review
 * round 6), so the
 * day's total is at most the allowance plus one deadline per instance.
 *
 * A RESERVATION EXPIRES (consolidated review round 4). One that is never
 * settled (the process died between the two statements, or the settling
 * statement failed) held the rest of the organisation's day: every job of
 * it BUSY until 00:00 UTC. The row's reservedUntil is the latest expiry of
 * its reservations (each its deadline plus RESERVATION_GRACE_MS from when
 * it was taken), and once that has passed every job that reserved is gone,
 * so the reservations count as 0. A leaked reservation therefore blocks for
 * at most one deadline plus RESERVATION_GRACE_MS (about 20 s) after the
 * organisation's last reservation, never the day. A job still running past
 * its expiry (a load or a settling statement slower than the grace) only
 * lets one more job be admitted early: at most one deadline over, as above.
 *
 * SPENT IS NOT IN FLIGHT (consolidated review round 3). The reservations are
 * their own column (reservedMs), apart from the settled time (ms): a job is
 * admitted while ms + reservedMs is under the allowance, and refused
 * ALLOWANCE (until 00:00 UTC) only when the SETTLED time has reached it.
 * Refused only because jobs in flight hold the rest, it is BUSY, which
 * clears in seconds. The verify's pre-SAP check (checkContractTime) reads
 * the settled time alone, so two builders of one organisation never see a
 * day's refusal for each other's jobs in flight.
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
type ContractTimeSpent = Extract<ContractTimeCheck, { ok: false }>;
/** Refused only because jobs in flight hold the rest of the allowance: BUSY, not the day's refusal. */
type ContractTimeInFlight = { ok: false; inFlight: true };

function spent(seconds: number, now: Date): ContractTimeSpent {
  return {
    ok: false,
    detail: `your organisation has used its ${seconds} s of contract compile time for today. It is available again at 00:00 UTC.`,
    retryAfterMs: nextUtcMidnight(now).getTime() - now.getTime(),
  };
}

const clampMs = (ms: number) => Math.max(0, Math.min(2_000_000_000, Math.round(ms)));

/**
 * Whether the organisation may start a job now: refused once its settled
 * time has reached today's allowance (jobs in flight do not count). A read
 * that reserves nothing: the verify asks it before it fetches a description,
 * and the job itself then reserves (below).
 */
export async function checkContractTime(organizationId: string, now: Date = new Date()): Promise<ContractTimeCheck> {
  const seconds = contractSecondsPerOrgDay();
  if (seconds === 0) return { ok: true };
  const rows = await prisma.$queryRaw<{ ms: number }[]>(Prisma.sql`
    SELECT "ms" FROM "ContractTime" WHERE "organizationId" = ${organizationId} AND "day" = ${utcDay(now)}::date
  `);
  return (rows[0]?.ms ?? 0) < seconds * 1000 ? { ok: true } : spent(seconds, now);
}

/**
 * How long past its deadline a reservation is held: the worker's exit grace
 * (5 s, envelope.ts), the job's load before it and the settling statement
 * after it. Past it, the reservation no longer counts (see the header).
 */
export const RESERVATION_GRACE_MS = 10_000;

/** What a job reserved, settled with chargeContractTime(organizationId, wallMs, at, ms). */
export interface ContractTimeReservation {
  at: Date;
  ms: number;
}

/**
 * Check and reserve in one statement (see the header): `reserveMs` is added
 * to the organisation's reservations only while its settled time and
 * reservations together are under the allowance, so concurrent jobs on any
 * number of instances are admitted one reservation at a time, and none once
 * they reach the allowance. Reservations whose expiry (reservedUntil) has
 * passed count as 0, and are replaced by this one. Not admitted, the row is
 * read again: the day is spent only when the settled time has reached the
 * allowance, and otherwise the job is refused as in flight (BUSY). With the
 * allowance unlimited nothing is reserved (0 ms), and the job's wall time is
 * still charged when it settles.
 */
export async function reserveContractTime(
  organizationId: string,
  reserveMs: number,
  now: Date = new Date(),
): Promise<{ ok: true; reservation: ContractTimeReservation } | ContractTimeSpent | ContractTimeInFlight> {
  const seconds = contractSecondsPerOrgDay();
  if (seconds === 0) return { ok: true, reservation: { at: now, ms: 0 } };
  const ms = clampMs(reserveMs);
  const at = now.toISOString();
  const until = new Date(now.getTime() + ms + RESERVATION_GRACE_MS).toISOString();
  // The reservations that still count: none once the latest of them has expired.
  const held = Prisma.sql`(CASE WHEN "ContractTime"."reservedUntil" < ${at}::timestamptz THEN 0 ELSE "ContractTime"."reservedMs" END)`;
  const rows = await prisma.$queryRaw<{ ms: number }[]>(Prisma.sql`
    INSERT INTO "ContractTime" ("organizationId", "day", "ms", "reservedMs", "reservedUntil")
      VALUES (${organizationId}, ${utcDay(now)}::date, 0, ${ms}, ${until}::timestamptz)
    ON CONFLICT ("organizationId", "day") DO UPDATE
      SET "reservedMs" = LEAST(${held}::bigint + EXCLUDED."reservedMs", 2000000000)::int,
        "reservedUntil" = GREATEST("ContractTime"."reservedUntil", EXCLUDED."reservedUntil")
      WHERE "ContractTime"."ms"::bigint + ${held} < ${seconds * 1000}
    RETURNING "ms"
  `);
  if (rows.length > 0) return { ok: true, reservation: { at: now, ms } };
  const settled = await checkContractTime(organizationId, now);
  return settled.ok ? { ok: false, inFlight: true } : settled;
}

/** Rows older than this many days are deleted by a charge. */
const KEEP_DAYS = 7;
let prunedAt = 0;

/**
 * Add a job's wall time to the organisation's day (the day of `now`: a
 * reservation's own day when one is settled), and give back `reservedMs`,
 * what the job reserved before it ran (0 for a plain charge). A job that
 * never ran settles with 0 and so only gives its reservation back. Never
 * throws: a charge that fails is logged, and a reservation it failed to
 * settle stays held until it expires (see the header).
 */
export async function chargeContractTime(organizationId: string, wallMs: number, now: Date = new Date(), reservedMs = 0): Promise<void> {
  const ms = clampMs(wallMs);
  const reserved = clampMs(reservedMs);
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ContractTime" ("organizationId", "day", "ms") VALUES (${organizationId}, ${utcDay(now)}::date, ${ms})
      ON CONFLICT ("organizationId", "day") DO UPDATE
        SET "ms" = LEAST("ContractTime"."ms"::bigint + EXCLUDED."ms", 2000000000)::int,
          "reservedMs" = GREATEST(0, "ContractTime"."reservedMs" - ${reserved}::int)
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
