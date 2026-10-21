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
 *     deployment deploymentDayMs in a day — compiles, diffs, record-time
 *     renders and read-path renders alike, because a loop of large kit
 *     downloads is the same CPU as a loop of verifies;
 *   - a job is charged when it ends, with the CPU time its worker thread
 *     measured for itself (compile.worker.ts), or — when it was ended by a
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
 * …_PER_DAY, COREEDGE_ENVELOPE_DEPLOYMENT_SECONDS_PER_DAY); the defaults keep
 * a whole deployment's envelope inside a quarter of a Hobby plan's Active CPU
 * (under one CPU-hour in a 31-day month) however its tenants behave, and one
 * organisation's day is about half of the deployment's, so it takes more
 * than one organisation to spend it. They are still a hundred or more
 * verifies of real services a day for each organisation (a real description
 * compiles in tens to hundreds of milliseconds); a deployment on a plan
 * with more Active CPU raises them. A job with no organisation (a test, a
 * script) is outside the allowance.
 */

import { Redis } from "@upstash/redis/cloudflare";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The defaults, in milliseconds of envelope worker time (see the header). */
export const ENVELOPE_ALLOWANCE = {
  tenantHourMs: 30_000,
  tenantDayMs: 60_000,
  deploymentDayMs: 110_000,
} as const;

export interface AllowanceLimits {
  tenantHourMs: number;
  tenantDayMs: number;
  deploymentDayMs: number;
}

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

/** The three windows a job of `tenant` is counted in, at `at`. */
function windowsOf(tenant: string, at: number): { hour: string; day: string; deployment: string } {
  const hour = Math.floor(at / HOUR_MS);
  const day = Math.floor(at / DAY_MS);
  return {
    hour: `coreedge:envelope:time:t:${tenant}:h:${hour}`,
    day: `coreedge:envelope:time:t:${tenant}:d:${day}`,
    deployment: `coreedge:envelope:time:all:d:${day}`,
  };
}

export type AllowanceCheck = { ok: true } | { ok: false; window: "hour" | "day" | "deployment"; retryAfterMs: number };

/** Whether `tenant` may start an envelope job now: its hour, its day and the deployment's day all have time left. */
export async function checkEnvelopeAllowance(tenant: string, limits: AllowanceLimits = envelopeAllowanceLimits()): Promise<AllowanceCheck> {
  const at = now();
  const w = windowsOf(tenant, at);
  const [hour = 0, day = 0, deployment = 0] = await withStore((s) => s.spent([w.hour, w.day, w.deployment]));
  const toNextDay = DAY_MS - (at % DAY_MS);
  if (deployment >= limits.deploymentDayMs) return { ok: false, window: "deployment", retryAfterMs: toNextDay };
  if (day >= limits.tenantDayMs) return { ok: false, window: "day", retryAfterMs: toNextDay };
  if (hour >= limits.tenantHourMs) return { ok: false, window: "hour", retryAfterMs: HOUR_MS - (at % HOUR_MS) };
  return { ok: true };
}

/** Charge `ms` of worker time to `tenant`'s windows and the deployment's. Never throws: a charge that cannot be counted is logged. */
export async function chargeEnvelopeAllowance(tenant: string, ms: number): Promise<void> {
  if (!(ms > 0)) return;
  const w = windowsOf(tenant, now());
  try {
    await withStore((s) =>
      s.add([
        { key: w.hour, ms, ttlMs: 2 * HOUR_MS },
        { key: w.day, ms, ttlMs: 2 * DAY_MS },
        { key: w.deployment, ms, ttlMs: 2 * DAY_MS },
      ]),
    );
  } catch (err) {
    console.error("[contracts] envelope allowance not charged", { error: err instanceof Error ? err.name : "unknown" });
  }
}

/** What a refusal for a spent allowance says: whose time, and when there is more. */
export function allowanceRefusalDetail(check: Exclude<AllowanceCheck, { ok: true }>): string {
  const minutes = Math.max(1, Math.ceil(check.retryAfterMs / 60_000));
  const when = minutes < 120 ? `in about ${minutes} minute${minutes === 1 ? "" : "s"}` : `in about ${Math.ceil(minutes / 60)} hours`;
  return check.window === "deployment"
    ? `The contract compiler has used all the time it may use today on this deployment, so this was not compiled. It is available again ${when}.`
    : `This organisation has used all the contract compiler's time it may use this ${check.window}, so this was not compiled. It is available again ${when}.`;
}
