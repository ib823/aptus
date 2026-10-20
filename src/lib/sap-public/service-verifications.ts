/**
 * Service verification, PER ENVIRONMENT — the record the write gate reads.
 *
 * WHY PER ENVIRONMENT. A custom service is a path the customer typed; Verify
 * asks one SAP system whether it exists there, is OData, and declares the
 * interface's dataset. That answer is about THAT system. A single "verified
 * at" let a successful check in SANDBOX or DEV unlock writes in PROD, against
 * a system where the service might not be transported yet, or be another
 * version of it. So each successful verify is stored under the environment it
 * was made for, with the binding that answered — connection, SAP client and
 * host — and a write is allowed only when the caller's environment holds an
 * entry for the very binding the write is about to use.
 *
 * Stored on `Interface.serviceVerifications` as
 * `{ [environment]: { at, connectionId, sapClient, baseUrl } }`. Cleared, with
 * every other verification field, whenever the contract changes.
 *
 * CLIENT-SAFE and pure: no prisma. Anything that does not parse as an entry
 * reads as "not verified" — a hand-edited row can only take access away.
 */

export interface ServiceVerificationEntry {
  /** ISO timestamp of the successful verify. */
  at: string;
  connectionId: string;
  sapClient: string | null;
  baseUrl: string;
}

export type ServiceVerifications = Record<string, ServiceVerificationEntry>;

function isEntry(v: unknown): v is ServiceVerificationEntry {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.at === "string" &&
    typeof e.connectionId === "string" &&
    e.connectionId !== "" &&
    (e.sapClient === null || typeof e.sapClient === "string") &&
    typeof e.baseUrl === "string" &&
    e.baseUrl !== ""
  );
}

/** The stored JSON as entries; anything malformed is dropped, never trusted. */
export function parseServiceVerifications(json: unknown): ServiceVerifications {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return {};
  const out: ServiceVerifications = {};
  for (const [env, entry] of Object.entries(json as Record<string, unknown>)) {
    if (isEntry(entry)) {
      out[env] = { at: entry.at, connectionId: entry.connectionId, sapClient: entry.sapClient, baseUrl: entry.baseUrl };
    }
  }
  return out;
}

/** The stored JSON with one environment's entry set (a new object). */
export function withServiceVerification(
  json: unknown,
  environment: string,
  entry: ServiceVerificationEntry,
): ServiceVerifications {
  return { ...parseServiceVerifications(json), [environment]: entry };
}

/**
 * Has this service been verified for `environment`, through exactly this
 * binding? The connection, its SAP client and its host must all be the ones
 * that answered the verify: a re-bound environment, a changed client or an
 * edited host is a system nobody has asked.
 */
export function isVerifiedForBinding(
  json: unknown,
  binding: { environment: string; connectionId: string; sapClient: string | null; baseUrl: string },
): boolean {
  const entry = parseServiceVerifications(json)[binding.environment];
  if (!entry) return false;
  return (
    entry.connectionId === binding.connectionId &&
    (entry.sapClient ?? null) === (binding.sapClient ?? null) &&
    entry.baseUrl === binding.baseUrl
  );
}

/** For display: environment, when, and which client — never a host or an id. */
export function verifiedEnvironmentsForDisplay(
  json: unknown,
): Array<{ environment: string; at: string; sapClient: string | null }> {
  const order = ["SANDBOX", "DEV", "TEST", "PROD"];
  return Object.entries(parseServiceVerifications(json))
    .map(([environment, e]) => ({ environment, at: e.at, sapClient: e.sapClient }))
    .sort((a, b) => {
      const ia = order.indexOf(a.environment);
      const ib = order.indexOf(b.environment);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
}
