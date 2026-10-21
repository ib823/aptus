/**
 * A circuit breaker per SAP system.
 *
 * WHAT IT IS FOR, and it is not politeness. When a customer's SAP system stops
 * answering, every lane on it keeps calling — each call waiting out its own
 * timeout, each holding a connection, and every one of them arriving at a system
 * that is already struggling. The breaker turns that into a fast refusal, which
 * is better for the caller (an answer in milliseconds instead of thirty seconds)
 * and better for SAP (no amplification of its own outage).
 *
 * THE STATUS IS A PROMISE ABOUT WHERE THE CALL STOPPED. "Circuit open" claims
 * nothing was sent to SAP, and that claim has to be true — which is why the
 * breaker is consulted BEFORE the request is built, and why its state is
 * returned rather than inferred from a failure count at render time.
 *
 * THREE STATES, and the half-open one is the whole design. A breaker that only
 * opened and closed would either stay open forever or slam the recovering system
 * with the full load the instant it closed. Half-open lets exactly one call
 * through: if it succeeds the circuit closes, if it fails the circuit re-opens
 * with a fresh cooldown, and nothing else is attempted in between.
 *
 * TWO WAYS TO HOLD THE STATE (P0.14).
 *
 *   In-process — `beforeCall`, `recordOutcome`, `snapshot` and `closeEarly`
 *   below keep module-scope state, so each serverless instance keeps its own
 *   view. On a fleet of N instances up to N probe calls may reach a failing
 *   system per cooldown instead of one. `snapshot` is labelled as one
 *   instance's view.
 *
 *   Shared — `createCircuitBreaker` runs the same state machine (the pure
 *   `decide` and `applyOutcome`) over a `CircuitStore`. The governed pipeline
 *   uses Upstash Redis, the store the rate limiter already uses, when
 *   UPSTASH_REDIS_REST_URL and _TOKEN are set: five failures seen by any
 *   instances together open the circuit for all of them. Every change is a
 *   compare-and-set on the stored record, so two instances recording at once
 *   cannot lose a failure. Without Upstash it falls back to the in-process
 *   store and says so (`shared: false`).
 *
 * A STORE THAT CANNOT BE ASKED NEVER REFUSES A CALL. The breaker protects SAP
 * from amplification; it is not a gate on access. If Redis errors, the call
 * goes ahead as it did before the breaker existed, and the error is logged
 * once. Refusing every call because Redis is down would turn a cache outage
 * into an SAP outage.
 */

export type CircuitState = "closed" | "open" | "half-open";

/** Consecutive failures before the circuit opens. */
export const FAILURE_THRESHOLD = 5;

/** How long it stays open before allowing one probe through. */
export const COOLDOWN_MS = 30_000;

/**
 * How long a half-open probe holds the circuit before another may try. Longer
 * than the slowest governed call (a write: 10 s for the token, 45 s for the
 * POST), so a probe still running is never doubled; finite, so an instance
 * that died mid-probe cannot leave the circuit half-open forever.
 */
export const PROBE_LEASE_MS = 60_000;

/**
 * Only these count as failures. A 403 does NOT: it is a definitive answer from
 * a healthy system about one entity's authorisation, and counting it would open
 * the circuit for every lane on a system because one lane lacks a scope.
 */
export type CallOutcome = "ok" | "timeout" | "upstream-error" | "refused";

/** One circuit's state: what a store holds, and what the pure transitions take. */
export interface CircuitRecord {
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly openedAt: number | null;
  /** Set while a half-open probe is in flight, so only one is. */
  readonly probeInFlight: boolean;
  /** When that probe was let through, for PROBE_LEASE_MS. */
  readonly probeStartedAt: number | null;
  /**
   * When an outcome last changed this circuit. In a shared store an outcome
   * that changes nothing else (a success on a clean, closed circuit) is not
   * written, so this is not the time of the latest call.
   */
  readonly lastOutcomeAt: number | null;
}

export const CLOSED_CIRCUIT: CircuitRecord = {
  state: "closed",
  consecutiveFailures: 0,
  openedAt: null,
  probeInFlight: false,
  probeStartedAt: null,
  lastOutcomeAt: null,
};

export interface CircuitDecision {
  readonly allowed: boolean;
  readonly state: CircuitState;
  /** Seconds until the next probe is allowed, when open. */
  readonly retryAfterSeconds: number | null;
}

/**
 * Ask before calling SAP: the decision, and the record as it must be stored
 * after it (a half-open probe is taken here). Pure.
 */
export function decide(c: CircuitRecord, now: number): { decision: CircuitDecision; next: CircuitRecord } {
  if (c.state === "closed") {
    return { decision: { allowed: true, state: "closed", retryAfterSeconds: null }, next: c };
  }

  if (c.state === "open") {
    const elapsed = now - (c.openedAt ?? now);
    if (elapsed < COOLDOWN_MS) {
      return {
        decision: { allowed: false, state: "open", retryAfterSeconds: Math.ceil((COOLDOWN_MS - elapsed) / 1000) },
        next: c,
      };
    }
    // Cooldown served: let exactly one call through to find out.
    return {
      decision: { allowed: true, state: "half-open", retryAfterSeconds: null },
      next: { ...c, state: "half-open", probeInFlight: true, probeStartedAt: now },
    };
  }

  // half-open: one probe at a time, everything else still refused fast.
  const leaseHeld = c.probeInFlight && (c.probeStartedAt === null || now - c.probeStartedAt < PROBE_LEASE_MS);
  if (leaseHeld) {
    return { decision: { allowed: false, state: "half-open", retryAfterSeconds: 1 }, next: c };
  }
  return {
    decision: { allowed: true, state: "half-open", retryAfterSeconds: null },
    next: { ...c, probeInFlight: true, probeStartedAt: now },
  };
}

/** Record what happened. Pure. */
export function applyOutcome(c: CircuitRecord, outcome: CallOutcome, now: number): CircuitRecord {
  const settled = { ...c, lastOutcomeAt: now, probeInFlight: false, probeStartedAt: null };

  /*
   * A refusal is a HEALTHY answer. SAP signed us in, understood the request and
   * said no — that is one lane's authorisation problem, not a sick system.
   * Counting it would take every other lane on the system down with it, and the
   * owner attribution would be wrong in both directions.
   */
  if (outcome === "refused") return settled;

  if (outcome === "ok") {
    return { ...settled, state: "closed", consecutiveFailures: 0, openedAt: null };
  }

  const failures = c.consecutiveFailures + 1;
  /*
   * A failed half-open probe re-opens immediately with a FRESH cooldown, rather
   * than waiting for the threshold again. The system has already demonstrated
   * it is not ready; sending four more calls to prove it is exactly the
   * amplification the breaker exists to stop.
   */
  if (c.state === "half-open" || failures >= FAILURE_THRESHOLD) {
    return { ...settled, consecutiveFailures: failures, state: "open", openedAt: now };
  }
  return { ...settled, consecutiveFailures: failures };
}

export interface CircuitSnapshot {
  readonly key: string;
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly retryAfterSeconds: number | null;
  readonly lastOutcomeAt: Date | null;
}

function snapshotOf(key: string, c: CircuitRecord, now: number): CircuitSnapshot {
  const retry =
    c.state === "open" && c.openedAt !== null ? Math.max(0, Math.ceil((COOLDOWN_MS - (now - c.openedAt)) / 1000)) : null;
  return {
    key,
    state: c.state,
    consecutiveFailures: c.consecutiveFailures,
    retryAfterSeconds: retry,
    lastOutcomeAt: c.lastOutcomeAt === null ? null : new Date(c.lastOutcomeAt),
  };
}

/* ── in-process state: one instance's view ────────────────────────────── */

const circuits = new Map<string, CircuitRecord>();

function circuitFor(key: string): CircuitRecord {
  return circuits.get(key) ?? CLOSED_CIRCUIT;
}

/**
 * Ask before calling SAP (this instance's view).
 *
 * Call `recordOutcome` with the result afterwards — a decision that is never
 * followed by an outcome leaves a half-open probe in flight until its lease
 * runs out, which is why the caller must record even when it throws.
 */
export function beforeCall(key: string, now: number = Date.now()): CircuitDecision {
  const { decision, next } = decide(circuitFor(key), now);
  circuits.set(key, next);
  return decision;
}

/** Record what happened. Must be called for every allowed call, including throws. */
export function recordOutcome(key: string, outcome: CallOutcome, now: number = Date.now()): void {
  circuits.set(key, applyOutcome(circuitFor(key), outcome, now));
}

/**
 * What THIS instance believes.
 *
 * Named for what it is. An operator screen must label it as one instance's view,
 * because presenting an in-process number as fleet-wide is the same class of
 * lie the audit found elsewhere — a sampled figure rendered as a total.
 */
export function snapshot(key: string, now: number = Date.now()): CircuitSnapshot {
  return snapshotOf(key, circuitFor(key), now);
}

/**
 * Close a circuit early.
 *
 * The design gives operators this, and it is deliberately not a "disable the
 * breaker" switch: it resets one circuit to closed so the next call is tried
 * for real. If the system is still down the breaker opens again on its own.
 */
export function closeEarly(key: string): void {
  circuits.set(key, CLOSED_CIRCUIT);
}

/** Test seam. Not exported through any route. */
export function __resetAllCircuits(): void {
  circuits.clear();
}

/* ── shared state ─────────────────────────────────────────────────────── */

/**
 * Where a shared breaker keeps its records: a read, and a compare-and-set on
 * the serialised record. That is all the state machine needs to run the same
 * way in every instance that shares the store.
 */
export interface CircuitStore {
  /** True when every instance of the deployment sees this store (Redis); false for one instance's memory. */
  readonly shared: boolean;
  read(key: string): Promise<string | null>;
  /** Write `next` only if the stored value is still `expected` (null: absent). */
  compareAndSet(key: string, expected: string | null, next: string): Promise<boolean>;
}

/** One instance's store. Also what a test hands two breakers to stand in for Redis. */
export class MemoryCircuitStore implements CircuitStore {
  readonly shared: boolean;
  private readonly values = new Map<string, string>();
  constructor(options: { shared?: boolean } = {}) {
    this.shared = options.shared ?? false;
  }
  async read(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async compareAndSet(key: string, expected: string | null, next: string): Promise<boolean> {
    if ((this.values.get(key) ?? null) !== expected) return false;
    this.values.set(key, next);
    return true;
  }
  clear(): void {
    this.values.clear();
  }
}

/** The subset of the Upstash client the store uses. */
export interface RedisLike {
  get(key: string): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

/** How long Redis keeps a circuit no call has touched. A closed, unused circuit is the same as no record. */
export const CIRCUIT_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Atomic compare-and-set. An empty expected value means "absent": a stored
 * record is JSON and never empty.
 */
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if (current == false and ARGV[1] == '') or current == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
  return 1
end
return 0
`;

const REDIS_PREFIX = "coreedge:circuit:";

/** Upstash as a CircuitStore. The client must not deserialise values: the store compares the raw strings. */
export function upstashCircuitStore(redis: RedisLike): CircuitStore {
  return {
    shared: true,
    async read(key) {
      const value = await redis.get(`${REDIS_PREFIX}${key}`);
      return typeof value === "string" ? value : null;
    },
    async compareAndSet(key, expected, next) {
      const result = await redis.eval(CAS_SCRIPT, [`${REDIS_PREFIX}${key}`], [
        expected ?? "",
        next,
        String(CIRCUIT_RECORD_TTL_MS),
      ]);
      return Number(result) === 1;
    },
  };
}

function serialise(c: CircuitRecord): string {
  return JSON.stringify([c.state, c.consecutiveFailures, c.openedAt, c.probeInFlight, c.probeStartedAt, c.lastOutcomeAt]);
}

function deserialise(raw: string | null): CircuitRecord {
  if (raw === null) return CLOSED_CIRCUIT;
  try {
    const [state, consecutiveFailures, openedAt, probeInFlight, probeStartedAt, lastOutcomeAt] = JSON.parse(raw) as [
      CircuitState,
      number,
      number | null,
      boolean,
      number | null,
      number | null,
    ];
    if (state !== "closed" && state !== "open" && state !== "half-open") return CLOSED_CIRCUIT;
    return { state, consecutiveFailures, openedAt, probeInFlight, probeStartedAt, lastOutcomeAt };
  } catch {
    // A record this code cannot read is treated as no record: closed.
    return CLOSED_CIRCUIT;
  }
}

/** Everything that decides a call, `lastOutcomeAt` aside. */
function sameState(a: CircuitRecord, b: CircuitRecord): boolean {
  return (
    a.state === b.state &&
    a.consecutiveFailures === b.consecutiveFailures &&
    a.openedAt === b.openedAt &&
    a.probeInFlight === b.probeInFlight &&
    a.probeStartedAt === b.probeStartedAt
  );
}

/** How many times a contended compare-and-set is retried before the breaker gives up on that write. */
const CAS_ATTEMPTS = 5;

export interface SharedCircuitDecision extends CircuitDecision {
  /** True when the store could not be asked and the call was let through regardless. */
  readonly degraded: boolean;
}

export interface CircuitBreaker {
  /** Fleet-wide when the store is shared; this instance's view otherwise. */
  readonly shared: boolean;
  beforeCall(key: string, now?: number): Promise<SharedCircuitDecision>;
  recordOutcome(key: string, outcome: CallOutcome, now?: number): Promise<void>;
  snapshot(key: string, now?: number): Promise<CircuitSnapshot | null>;
}

/**
 * The breaker over a store. Each change reads the record, runs the pure
 * transition, and writes it back only if nobody changed it in between,
 * retrying on contention: so five failures recorded by any instances at any
 * interleaving open the circuit for every one of them.
 */
export function createCircuitBreaker(store: CircuitStore, options: { onStoreError?: (err: unknown) => void } = {}): CircuitBreaker {
  const onStoreError = options.onStoreError ?? (() => undefined);
  const allowAnyway: SharedCircuitDecision = { allowed: true, state: "closed", retryAfterSeconds: null, degraded: true };

  return {
    shared: store.shared,

    async beforeCall(key, now = Date.now()) {
      try {
        for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
          const raw = await store.read(key);
          const { decision, next } = decide(deserialise(raw), now);
          const serialised = serialise(next);
          // Nothing changed (closed, or still open): nothing to write.
          if (raw === serialised || (raw === null && next === CLOSED_CIRCUIT)) return { ...decision, degraded: false };
          if (await store.compareAndSet(key, raw, serialised)) return { ...decision, degraded: false };
        }
        // Another instance kept winning the write: it took the probe. Refuse
        // only what the record says to refuse; never take a second probe.
        const { decision } = decide(deserialise(await store.read(key)), now);
        return decision.state === "half-open" ? { allowed: false, state: "half-open", retryAfterSeconds: 1, degraded: false } : { ...decision, degraded: false };
      } catch (err) {
        onStoreError(err);
        return allowAnyway;
      }
    },

    async recordOutcome(key, outcome, now = Date.now()) {
      try {
        for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
          const raw = await store.read(key);
          const current = deserialise(raw);
          // A success on a circuit with nothing recorded changes nothing worth a write.
          if (raw === null && outcome === "ok") return;
          const next = applyOutcome(current, outcome, now);
          /*
           * NOR DOES AN OUTCOME THAT LEAVES THE STATE AS IT WAS: a success on
           * a closed circuit with no failures, a refusal on a closed one.
           * Only `lastOutcomeAt` would change, and writing it would cost an
           * Upstash command on every call and renew the record's expiry
           * forever, so a busy connection's record would never expire.
           */
          if (raw !== null && sameState(current, next)) return;
          const serialised = serialise(next);
          if (raw === serialised) return;
          if (await store.compareAndSet(key, raw, serialised)) return;
        }
      } catch (err) {
        onStoreError(err);
      }
    },

    async snapshot(key, now = Date.now()) {
      try {
        return snapshotOf(key, deserialise(await store.read(key)), now);
      } catch (err) {
        onStoreError(err);
        return null;
      }
    },
  };
}
