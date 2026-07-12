/**
 * Short-TTL, in-process cache for the EXPENSIVE live-SAP read routes
 * (/operations, /entities?probe=1) so repeated loads within a warm serverless
 * instance don't re-hammer the SAP tenant. Keyed by (product, tenant[, service…]).
 * Callers surface the returned `at` to the UI as a freshness timestamp and can
 * bypass with ?refresh=1. Best-effort per-instance — never a correctness source.
 */
interface Entry {
  at: number;
  value: unknown;
}

const store = new Map<string, Entry>();
const DEFAULT_TTL_MS = 30_000;

/** Returns the cached value + when it was stored, or null if missing/expired. */
export function getLiveCache<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): { value: T; at: number } | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() - e.at > ttlMs) {
    store.delete(key);
    return null;
  }
  return { value: e.value as T, at: e.at };
}

/** Store a value and return its timestamp (ms). */
export function setLiveCache(key: string, value: unknown): number {
  const at = Date.now();
  store.set(key, { at, value });
  return at;
}
