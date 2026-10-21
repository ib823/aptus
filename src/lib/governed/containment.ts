/**
 * The containment step's circuit breaker, as the governed pipeline runs it
 * (P0.14).
 *
 * THE SETTING. `COREEDGE_CIRCUIT_BREAKER`:
 *
 *   observe  (the default) the breaker counts every SAP outcome, opens and
 *            half-opens exactly as it would when enforcing, and logs
 *            `[circuit] would refuse` where it would have refused. It never
 *            refuses a call. A call it would have refused still goes to SAP,
 *            but its outcome is not recorded, since enforcing it would never
 *            have been made: so the stored circuit follows the enforce
 *            timeline, and the would-refuse lines count exactly the calls
 *            enforce would refuse (tests/unit/governed/
 *            circuit-observe-parity.test.ts). A deploy with it changes no
 *            answer any caller gets: a call that works today keeps working.
 *   enforce  an open circuit refuses the call before anything is sent to
 *            SAP: 503 CIRCUIT_OPEN with Retry-After, audited with the failure
 *            reason CIRCUIT_OPEN. Switch it on per
 *            docs/runbooks/coreedge-circuit-breaker.md once the observe logs
 *            show it would have refused only during real outages.
 *   off      the breaker is not consulted at all: no store reads or writes.
 *
 * Anything else, a typo included, reads as observe: the one mode that both
 * records and can never refuse a call.
 *
 * THE STORE. Upstash Redis when UPSTASH_REDIS_REST_URL and _TOKEN are set —
 * the rate limiter's own store — so every instance shares one circuit per SAP
 * system. Without them, this instance's memory (each instance then opens its
 * own circuit after five failures it saw itself). A store that errors never
 * refuses a call; the error is logged once per instance.
 */

import { Redis } from "@upstash/redis/cloudflare";

import {
  createCircuitBreaker,
  MemoryCircuitStore,
  upstashCircuitStore,
  type CircuitBreaker,
  type CircuitStore,
} from "@/lib/northbound/circuit-breaker";

export type CircuitBreakerMode = "off" | "observe" | "enforce";

/**
 * The audit row's failureReason for a call the open circuit refused. SAP was
 * not called, so the upstream-errors incident leaves it out, as it does a
 * limiter outage (src/app/api/ops/incidents/route.ts).
 */
export const FAILURE_REASON_CIRCUIT_OPEN = "CIRCUIT_OPEN";

export function circuitBreakerMode(env: Record<string, string | undefined> = process.env): CircuitBreakerMode {
  const raw = env.COREEDGE_CIRCUIT_BREAKER?.trim().toLowerCase();
  if (raw === "enforce") return "enforce";
  if (raw === "off") return "off";
  return "observe";
}

let override: CircuitStore | null = null;
let breaker: CircuitBreaker | null = null;
let warnedStoreError = false;

function defaultStore(): CircuitStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    // Raw strings: the store compares the serialised record byte for byte.
    return upstashCircuitStore(new Redis({ url, token, automaticDeserialization: false }));
  }
  return new MemoryCircuitStore();
}

/** The breaker every governed entry point consults. */
export function governedCircuitBreaker(): CircuitBreaker {
  if (breaker === null) {
    breaker = createCircuitBreaker(override ?? defaultStore(), {
      onStoreError: (err) => {
        if (warnedStoreError) return;
        warnedStoreError = true;
        console.error("[circuit] the breaker's store could not be asked; calls go ahead unchecked", err);
      },
    });
  }
  return breaker;
}

/**
 * Test seam: the store the governed breaker uses from the next call on. Null
 * restores the default (Upstash when configured, else memory). Not exported
 * through any route.
 */
export function __setGovernedCircuitStore(store: CircuitStore | null): void {
  override = store;
  breaker = null;
}

/**
 * The circuit a call belongs to: one per SAP system. A stored connection is
 * its own system; a deployment's `{PREFIX}_*` tenant is keyed by prefix and
 * tenant key.
 */
export function circuitKeyForConnection(connectionId: string): string {
  return `connection:${connectionId}`;
}

export function circuitKeyForDeploymentTenant(envPrefix: string, tenantKey: string): string {
  return `deployment:${envPrefix}:${tenantKey}`;
}

/**
 * The circuit a Workbench console read of a system belongs to: the system's
 * key, inside the reading organization's own console scope.
 *
 * NOT THE PRODUCTION CIRCUIT, AND NOT SHARED ACROSS ORGANIZATIONS. A console
 * read's query is the builder's choice, and a deployment tenant (S4_TDD_*)
 * belongs to no organization: every organization may preview it. Were the
 * console to count its outcomes into the system's own circuit, one
 * organization's previews could refuse another's for 30 s at a time, and a
 * builder's previews of a stored connection could refuse the deployed
 * application's production reads on it (the northbound routes use
 * `circuitKeyForConnection`). So the console has a circuit of its own per
 * organization and system: a console reading a failing system is still
 * refused fast, and what it counts reaches nobody else.
 */
export function circuitKeyForConsoleRead(organizationScope: string, systemKey: string): string {
  return `console:${organizationScope}:${systemKey}`;
}
