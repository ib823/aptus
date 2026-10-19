/**
 * Short-TTL, in-process cache for the EXPENSIVE live-SAP read routes
 * (/operations, /entities?probe=1) so repeated loads within a warm serverless
 * instance don't re-hammer the SAP tenant. Keyed by WHOSE SYSTEM answered, then
 * (product[, service…]). Callers surface the returned `at` to the UI as a
 * freshness timestamp and can bypass with ?refresh=1. Best-effort per-instance
 * — never a correctness source.
 *
 * THE OWNER IS A REQUIRED ARGUMENT, NOT PART OF A KEY THE CALLER BUILDS. The
 * key used to be `ops:${product}:${tenant.key}`, built by each route. But a
 * connection key is unique only WITHIN an organization
 * (`@@unique([organizationId, product, key])`), and this Map is shared by every
 * request on the instance. Two organizations that both named a connection
 * "prod" shared one entry: the second was served the first one's live SAP
 * rows, entity sets and probe results, with `fromCache: true`, after passing
 * only its OWN environment ceiling, and with no audit row in either tenant.
 * probeStorageKey closed the same collision for stored probes; this cache was
 * keyed the old way, in both routes that use it. Taking the owner here means
 * no caller, including a route added later, can build an unscoped key.
 */
interface Entry {
  at: number;
  value: unknown;
}

/**
 * The system a cached value came from. `ResolvedReadTenant` is one.
 *
 * A stored connection is identified by its row id, which is unique across
 * organizations, and changes when a connection is deleted and created again, so
 * a new row is never served the old one's results. A deployment tenant has no
 * row; it is the same system for every organization on the deployment, so its
 * key is shared on purpose.
 */
export interface LiveCacheOwner {
  readonly tenant: { readonly key: string };
  readonly connection: { readonly id: string } | null;
}

const store = new Map<string, Entry>();
const DEFAULT_TTL_MS = 30_000;

function scopedKey(owner: LiveCacheOwner, key: string): string {
  const scope = owner.connection ? `conn:${owner.connection.id}` : `deployment:${owner.tenant.key}`;
  return `${scope}|${key}`;
}

/** Returns the cached value + when it was stored, or null if missing/expired. */
export function getLiveCache<T>(
  owner: LiveCacheOwner,
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
): { value: T; at: number } | null {
  const k = scopedKey(owner, key);
  const e = store.get(k);
  if (!e) return null;
  if (Date.now() - e.at > ttlMs) {
    store.delete(k);
    return null;
  }
  return { value: e.value as T, at: e.at };
}

/** Store a value and return its timestamp (ms). */
export function setLiveCache(owner: LiveCacheOwner, key: string, value: unknown): number {
  const at = Date.now();
  store.set(scopedKey(owner, key), { at, value });
  return at;
}
