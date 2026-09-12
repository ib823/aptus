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
 * IN-PROCESS, AND HONEST ABOUT IT. This holds state in module scope, so each
 * serverless instance keeps its own view. That is a real limitation and it is
 * stated rather than hidden: on a fleet of N instances, up to N probe calls may
 * reach a failing system per cooldown instead of one. It is still a large
 * improvement over none, and the shared-state version needs the same Redis the
 * rate limiter already falls back from — see `rateLimitBackend()`. The state is
 * exported so an operator screen shows what THIS instance believes, labelled as
 * such, rather than a number that looks fleet-wide and is not.
 */

export type CircuitState = "closed" | "open" | "half-open";

/** Consecutive failures before the circuit opens. */
export const FAILURE_THRESHOLD = 5;

/** How long it stays open before allowing one probe through. */
export const COOLDOWN_MS = 30_000;

/**
 * Only these count as failures. A 403 does NOT: it is a definitive answer from
 * a healthy system about one entity's authorisation, and counting it would open
 * the circuit for every lane on a system because one lane lacks a scope.
 */
export type CallOutcome = "ok" | "timeout" | "upstream-error" | "refused";

interface Circuit {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  /** Set while a half-open probe is in flight, so only one is. */
  probeInFlight: boolean;
  lastOutcomeAt: number | null;
}

const circuits = new Map<string, Circuit>();

function circuitFor(key: string): Circuit {
  const existing = circuits.get(key);
  if (existing !== undefined) return existing;
  const fresh: Circuit = {
    state: "closed",
    consecutiveFailures: 0,
    openedAt: null,
    probeInFlight: false,
    lastOutcomeAt: null,
  };
  circuits.set(key, fresh);
  return fresh;
}

export interface CircuitDecision {
  readonly allowed: boolean;
  readonly state: CircuitState;
  /** Seconds until the next probe is allowed, when open. */
  readonly retryAfterSeconds: number | null;
}

/**
 * Ask before calling SAP.
 *
 * Call `recordOutcome` with the result afterwards — a decision that is never
 * followed by an outcome leaves a half-open probe in flight forever, which is
 * why the caller must record even when it throws.
 */
export function beforeCall(key: string, now: number = Date.now()): CircuitDecision {
  const circuit = circuitFor(key);

  if (circuit.state === "closed") {
    return { allowed: true, state: "closed", retryAfterSeconds: null };
  }

  if (circuit.state === "open") {
    const elapsed = now - (circuit.openedAt ?? now);
    if (elapsed < COOLDOWN_MS) {
      return {
        allowed: false,
        state: "open",
        retryAfterSeconds: Math.ceil((COOLDOWN_MS - elapsed) / 1000),
      };
    }
    // Cooldown served: let exactly one call through to find out.
    circuit.state = "half-open";
    circuit.probeInFlight = true;
    return { allowed: true, state: "half-open", retryAfterSeconds: null };
  }

  // half-open: one probe at a time, everything else still refused fast.
  if (circuit.probeInFlight) {
    return { allowed: false, state: "half-open", retryAfterSeconds: 1 };
  }
  circuit.probeInFlight = true;
  return { allowed: true, state: "half-open", retryAfterSeconds: null };
}

/** Record what happened. Must be called for every allowed call, including throws. */
export function recordOutcome(key: string, outcome: CallOutcome, now: number = Date.now()): void {
  const circuit = circuitFor(key);
  circuit.lastOutcomeAt = now;
  circuit.probeInFlight = false;

  /*
   * A refusal is a HEALTHY answer. SAP signed us in, understood the request and
   * said no — that is one lane's authorisation problem, not a sick system.
   * Counting it would take every other lane on the system down with it, and the
   * owner attribution would be wrong in both directions.
   */
  if (outcome === "refused") return;

  if (outcome === "ok") {
    circuit.state = "closed";
    circuit.consecutiveFailures = 0;
    circuit.openedAt = null;
    return;
  }

  circuit.consecutiveFailures += 1;

  /*
   * A failed half-open probe re-opens immediately with a FRESH cooldown, rather
   * than waiting for the threshold again. The system has already demonstrated
   * it is not ready; sending four more calls to prove it is exactly the
   * amplification the breaker exists to stop.
   */
  if (circuit.state === "half-open" || circuit.consecutiveFailures >= FAILURE_THRESHOLD) {
    circuit.state = "open";
    circuit.openedAt = now;
  }
}

export interface CircuitSnapshot {
  readonly key: string;
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly retryAfterSeconds: number | null;
  readonly lastOutcomeAt: Date | null;
}

/**
 * What THIS instance believes.
 *
 * Named for what it is. An operator screen must label it as one instance's view,
 * because presenting an in-process number as fleet-wide is the same class of
 * lie the audit found elsewhere — a sampled figure rendered as a total.
 */
export function snapshot(key: string, now: number = Date.now()): CircuitSnapshot {
  const c = circuitFor(key);
  const retry =
    c.state === "open" && c.openedAt !== null
      ? Math.max(0, Math.ceil((COOLDOWN_MS - (now - c.openedAt)) / 1000))
      : null;
  return {
    key,
    state: c.state,
    consecutiveFailures: c.consecutiveFailures,
    retryAfterSeconds: retry,
    lastOutcomeAt: c.lastOutcomeAt === null ? null : new Date(c.lastOutcomeAt),
  };
}

/**
 * Close a circuit early.
 *
 * The design gives operators this, and it is deliberately not a "disable the
 * breaker" switch: it resets one circuit to closed so the next call is tried
 * for real. If the system is still down the breaker opens again on its own.
 */
export function closeEarly(key: string): void {
  const c = circuitFor(key);
  c.state = "closed";
  c.consecutiveFailures = 0;
  c.openedAt = null;
  c.probeInFlight = false;
}

/** Test seam. Not exported through any route. */
export function __resetAllCircuits(): void {
  circuits.clear();
}
