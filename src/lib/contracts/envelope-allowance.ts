/**
 * THE ENVELOPE'S TIME, PER ORGANISATION, OVER TIME (P1.3, structural
 * hardening round 5).
 *
 * The envelope (envelope.ts) bounds each job — its heap, its stack, its
 * deadline — and how many jobs run at once, per organisation and per
 * instance. Nothing bounded how much of it one organisation used over an
 * hour or a day. A builder whose SAP serves a cheap 7.6 MB description and
 * who loops verify-service at the sapLive rate (20 a minute) costs about
 * 3.2 s of CPU per verify: one core busy all the time, one CPU-hour an hour,
 * from one account. On a plan whose Active CPU is metered and capped (the
 * Hobby plan: 4 CPU-hours a month, then every function of the deployment is
 * paused for every tenant), that is an outage of the whole product in a few
 * hours — and on any plan it is every other tenant's latency.
 *
 * So the envelope's worker time is an ALLOWANCE, charged as it is used:
 *
 *   - each organisation may use ENVELOPE_ALLOWANCE.tenantHourMs of worker
 *     time in a clock hour and tenantDayMs in a UTC day, and the whole
 *     deployment deploymentDayMs in a day — compiles, diffs and record-time
 *     renders; read-path renders have windows of their own (below);
 *   - a job is charged when it ends, with the CPU time its worker thread
 *     measured for the job (compile.worker.ts), or — when it was ended by a
 *     limit before it could say — the time it ran;
 *   - a job of an organisation whose allowance is spent is refused BUSY
 *     before it takes any slot, as a job past its share is: a verify still
 *     answers, with its contract NOT_COMPILED, and says when the compiler is
 *     available to it again;
 *   - the windows are kept in the shared store (Upstash, as the rate limits
 *     are) when one is configured, so they hold across every instance a
 *     deployment scales to; without one, or while it cannot be reached, in
 *     this process — which still bounds what this instance spends.
 *
 * The sizes are a deployment's (COREEDGE_ENVELOPE_TENANT_SECONDS_PER_HOUR,
 * …_PER_DAY, COREEDGE_ENVELOPE_DEPLOYMENT_SECONDS_PER_DAY,
 * COREEDGE_ENVELOPE_TENANT_FLOOR_SECONDS_PER_DAY,
 * COREEDGE_ENVELOPE_READ_SECONDS_PER_HOUR, …_PER_DAY); the deployment's day
 * keeps its compiles inside a quarter of a Hobby plan's Active CPU (under one
 * CPU-hour in a 31-day month) while its organisations stay inside their
 * floors, and is where an operator looks first when they do not. The
 * defaults are hundreds of verifies of real services a day for each
 * organisation (a real description's compile and diff cost tens of
 * milliseconds of the job's own CPU); a deployment on a plan with more
 * Active CPU raises them. A job with no organisation (a test, a script) is
 * outside the allowance.
 *
 * WHAT IS SHARED IS NEVER SPENT FOR EVERYONE BY ONE OR TWO (structural
 * hardening round 6). Round 5's deployment day was a hard refusal for every
 * organisation alike: two organisations at their caps, or a few hundred
 * ordinary /schema reads of one large contract, spent it, and every tenant's
 * verify was NOT_COMPILED until midnight UTC. So:
 *
 *   - THE DEPLOYMENT'S DAY REFUSES ONLY THOSE PAST THEIR FLOOR. Once it is
 *     spent, an organisation that has used less than tenantFloorDayMs of its
 *     own day still runs; only one that has used more is refused for the
 *     deployment's day. No group of organisations can take a third's floor,
 *     whatever they do. (The deployment's spend is then bounded by its day
 *     plus a floor for each organisation active that day, not by its day
 *     alone: an operator watches it, and the refusals' log lines name it.)
 *   - READS HAVE AN ALLOWANCE OF THEIR OWN. A read path's render (a `render`
 *     job: /schema, the kit, the solution document past what the request
 *     thread renders) is charged to the reading organisation's read hour and
 *     read day, never to the windows that gate its builders' verifies and
 *     never to the deployment's day: a consumer polling a large /schema can
 *     spend its own organisation's reads, and nothing else.
 *   - A JOB IS CHARGED ITS OWN WORK. The worker measures the CPU of the job
 *     itself (compile.worker.ts), not its isolate's start and the compiler's
 *     load — the same tens of milliseconds for every job, which no
 *     description can make larger — plus JOB_BASE_CHARGE_MS, so a flood of
 *     trivial jobs still draws the allowance down. A real verify's compile
 *     and diff then cost tens of milliseconds: the floor alone is hundreds of
 *     verifies a day.
 *   - A REFUSAL SAYS WHOSE TIME AND WHEN (retryAfterMs), on every path: the
 *     verify, /schema, the kit and the document — never "in a moment".
 */

import { Redis } from "@upstash/redis/cloudflare";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The defaults, in milliseconds of envelope worker time (see the header). */
export const ENVELOPE_ALLOWANCE = {
  /** A compile's (compile, prepare, diff): the organisation's hour and day. */
  tenantHourMs: 30_000,
  tenantDayMs: 60_000,
  /** Every organisation's compiles together, in a day: refuses only an organisation past its floor of it. */
  deploymentDayMs: 110_000,
  /** What an organisation may use of its day whatever the deployment's day holds (round 6). */
  tenantFloorDayMs: 15_000,
  /** A read path's renders: the reading organisation's own hour and day, and nothing of the deployment's. */
  readTenantHourMs: 30_000,
  readTenantDayMs: 60_000,
} as const;

/**
 * What every job is charged beyond its own CPU: its share of an isolate's
 * start, at a flat rate no description can raise (the start itself is
 * 50-90 ms of CPU in the production bundle, the same for every job).
 */
export const JOB_BASE_CHARGE_MS = 10;

export interface AllowanceLimits {
  tenantHourMs: number;
  tenantDayMs: number;
  deploymentDayMs: number;
  tenantFloorDayMs: number;
  readTenantHourMs: number;
  readTenantDayMs: number;
}

/** Which allowance a job spends: a compile's (compile, prepare, diff) or a read's (a read path's render). */
export type AllowanceKind = "compile" | "read";

/** Where the windows are counted: the ms spent in each, and adding to them. */
export interface AllowanceStore {
  spent(keys: readonly string[]): Promise<number[]>;
  add(entries: readonly { key: string; ms: number; ttlMs: number }[]): Promise<void>;
}

const SECONDS_RANGE = [1, 10_000_000] as const;

function envSeconds(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= SECONDS_RANGE[0] && n <= SECONDS_RANGE[1] ? n * 1000 : null;
}

/** The allowance as this deployment configures it (read on every check, so a test or an operator can change it). */
export function envelopeAllowanceLimits(): AllowanceLimits {
  return {
    tenantHourMs: envSeconds("COREEDGE_ENVELOPE_TENANT_SECONDS_PER_HOUR") ?? ENVELOPE_ALLOWANCE.tenantHourMs,
    tenantDayMs: envSeconds("COREEDGE_ENVELOPE_TENANT_SECONDS_PER_DAY") ?? ENVELOPE_ALLOWANCE.tenantDayMs,
    deploymentDayMs: envSeconds("COREEDGE_ENVELOPE_DEPLOYMENT_SECONDS_PER_DAY") ?? ENVELOPE_ALLOWANCE.deploymentDayMs,
    tenantFloorDayMs: envSeconds("COREEDGE_ENVELOPE_TENANT_FLOOR_SECONDS_PER_DAY") ?? ENVELOPE_ALLOWANCE.tenantFloorDayMs,
    readTenantHourMs: envSeconds("COREEDGE_ENVELOPE_READ_SECONDS_PER_HOUR") ?? ENVELOPE_ALLOWANCE.readTenantHourMs,
    readTenantDayMs: envSeconds("COREEDGE_ENVELOPE_READ_SECONDS_PER_DAY") ?? ENVELOPE_ALLOWANCE.readTenantDayMs,
  };
}

/** Windows counted in this process: the store without a shared backend, and the one used while it is down. */
export function memoryAllowanceStore(clock: () => number = Date.now): AllowanceStore {
  const windows = new Map<string, { ms: number; expiresAt: number }>();
  const live = (key: string) => {
    const w = windows.get(key);
    if (w && w.expiresAt <= clock()) windows.delete(key);
    return windows.get(key);
  };
  return {
    spent: async (keys) => keys.map((k) => live(k)?.ms ?? 0),
    add: async (entries) => {
      const now = clock();
      // Expired windows go as new ones come: the map holds the live windows, not every one ever kept.
      if (windows.size > 10_000) for (const [k, w] of windows) if (w.expiresAt <= now) windows.delete(k);
      for (const e of entries) {
        const w = live(e.key);
        windows.set(e.key, { ms: (w?.ms ?? 0) + e.ms, expiresAt: w?.expiresAt ?? now + e.ttlMs });
      }
    },
  };
}

/** Windows counted in the shared store (Upstash): one MGET to check, one pipeline to charge. */
function redisAllowanceStore(redis: Redis): AllowanceStore {
  return {
    spent: async (keys) => {
      const values = await redis.mget<(number | string | null)[]>(...keys);
      return values.map((v) => Number(v ?? 0) || 0);
    },
    add: async (entries) => {
      const p = redis.pipeline();
      for (const e of entries) {
        p.incrby(e.key, Math.max(0, Math.round(e.ms)));
        // NX: the window's expiry is set once, when it is first written.
        p.pexpire(e.key, e.ttlMs, "NX");
      }
      await p.exec();
    },
  };
}

const memory = memoryAllowanceStore();
let shared: AllowanceStore | null | undefined;
let warned = false;

function sharedStore(): AllowanceStore | null {
  if (shared !== undefined) return shared;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  shared = url && token ? redisAllowanceStore(new Redis({ url, token })) : null;
  return shared;
}

/** For a test: the store and the clock the allowance uses; none puts back the defaults. */
let override: { store: AllowanceStore; clock: () => number } | null = null;
export function setEnvelopeAllowanceForTest(next: { store: AllowanceStore; clock: () => number } | null): void {
  override = next;
}

/** The shared store, falling back to this process's own while it cannot be reached (see the header). */
async function withStore<T>(run: (store: AllowanceStore) => Promise<T>): Promise<T> {
  if (override) return run(override.store);
  const s = sharedStore();
  if (s) {
    try {
      return await run(s);
    } catch (err) {
      if (!warned) {
        warned = true;
        console.error("[contracts] envelope allowance store unreachable; counting in this instance", {
          error: err instanceof Error ? err.name : "unknown",
        });
      }
    }
  }
  return run(memory);
}

const now = () => (override ? override.clock() : Date.now());

/**
 * The windows a job of `tenant` is counted in, at `at`: a compile's in the
 * organisation's hour and day and the deployment's day; a read's in the
 * organisation's read hour and read day only (see the header).
 */
function windowsOf(tenant: string, at: number, kind: AllowanceKind): { hour: string; day: string; deployment: string | null } {
  const hour = Math.floor(at / HOUR_MS);
  const day = Math.floor(at / DAY_MS);
  if (kind === "read") {
    return { hour: `coreedge:envelope:read:t:${tenant}:h:${hour}`, day: `coreedge:envelope:read:t:${tenant}:d:${day}`, deployment: null };
  }
  return {
    hour: `coreedge:envelope:time:t:${tenant}:h:${hour}`,
    day: `coreedge:envelope:time:t:${tenant}:d:${day}`,
    deployment: `coreedge:envelope:time:all:d:${day}`,
  };
}

export type AllowanceCheck =
  | { ok: true }
  | { ok: false; kind: AllowanceKind; window: "hour" | "day" | "deployment"; retryAfterMs: number };

/**
 * Whether `tenant` may start an envelope job of this kind now: its hour and
 * its day have time left — and, for a compile, the deployment's day has, or
 * the organisation is still inside its floor of its own day (round 6: a
 * shared window never refuses an organisation that has not used its floor).
 */
export async function checkEnvelopeAllowance(
  tenant: string,
  limits: AllowanceLimits = envelopeAllowanceLimits(),
  kind: AllowanceKind = "compile",
): Promise<AllowanceCheck> {
  const at = now();
  const w = windowsOf(tenant, at, kind);
  const keys = w.deployment === null ? [w.hour, w.day] : [w.hour, w.day, w.deployment];
  const [hour = 0, day = 0, deployment = 0] = await withStore((s) => s.spent(keys));
  const toNextDay = DAY_MS - (at % DAY_MS);
  const toNextHour = HOUR_MS - (at % HOUR_MS);
  const hourMs = kind === "read" ? limits.readTenantHourMs : limits.tenantHourMs;
  const dayMs = kind === "read" ? limits.readTenantDayMs : limits.tenantDayMs;
  if (day >= dayMs) return { ok: false, kind, window: "day", retryAfterMs: toNextDay };
  if (hour >= hourMs) return { ok: false, kind, window: "hour", retryAfterMs: toNextHour };
  if (w.deployment !== null && deployment >= limits.deploymentDayMs && day >= limits.tenantFloorDayMs) {
    return { ok: false, kind, window: "deployment", retryAfterMs: toNextDay };
  }
  return { ok: true };
}

/**
 * Charge `ms` of worker time to `tenant`'s windows of this kind (and, for a
 * compile, the deployment's). Never throws: a charge that cannot be counted
 * is logged.
 */
export async function chargeEnvelopeAllowance(tenant: string, ms: number, kind: AllowanceKind = "compile"): Promise<void> {
  if (!(ms > 0)) return;
  const w = windowsOf(tenant, now(), kind);
  try {
    await withStore((s) =>
      s.add([
        { key: w.hour, ms, ttlMs: 2 * HOUR_MS },
        { key: w.day, ms, ttlMs: 2 * DAY_MS },
        ...(w.deployment === null ? [] : [{ key: w.deployment, ms, ttlMs: 2 * DAY_MS }]),
      ]),
    );
  } catch (err) {
    console.error("[contracts] envelope allowance not charged", { error: err instanceof Error ? err.name : "unknown" });
  }
}

/** What a refusal for a spent allowance says: whose time, of what, and when there is more. */
export function allowanceRefusalDetail(check: Exclude<AllowanceCheck, { ok: true }>): string {
  const minutes = Math.max(1, Math.ceil(check.retryAfterMs / 60_000));
  const when = minutes < 120 ? `in about ${minutes} minute${minutes === 1 ? "" : "s"}` : `in about ${Math.ceil(minutes / 60)} hours`;
  if (check.kind === "read") {
    return `This organisation has used all the time the contract compiler may spend rendering its large contracts and documents this ${check.window}, so this was not rendered. It is available again ${when}.`;
  }
  return check.window === "deployment"
    ? `The contract compiler has used all the time it may use today on this deployment, and this organisation has used more than its own share of it, so this was not compiled. It is available again ${when}.`
    : `This organisation has used all the contract compiler's time it may use this ${check.window}, so this was not compiled. It is available again ${when}.`;
}
