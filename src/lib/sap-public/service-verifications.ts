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
 * ONE ENTRY PER BINDING, NOT PER ENVIRONMENT. One PROD system can serve two
 * SAP clients, set up as two PROD connections, and the broker binds a call by
 * environment AND client. Keyed by environment alone, verifying client 200
 * replaced client 100's entry, so the two could never both be writable
 * (review round 2). So an entry is keyed `${environment}::${sapClient ?? ""}`
 * — the pair the binding selects on — and carries its environment.
 *
 * Stored on `Interface.serviceVerifications` as
 * `{ [environment::client]: { environment, at, connectionId, sapClient, baseUrl } }`.
 * An entry stored under a bare environment key (the first shape) still reads,
 * as that environment. Cleared, with every other verification field, whenever
 * the contract changes.
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

export interface StoredServiceVerification extends ServiceVerificationEntry {
  environment: string;
}

export type ServiceVerifications = Record<string, StoredServiceVerification>;

const KEY_SEPARATOR = "::";

/** The key one binding's entry is stored under. */
export function verificationKey(environment: string, sapClient: string | null | undefined): string {
  return `${environment}${KEY_SEPARATOR}${sapClient ?? ""}`;
}

function isEntry(v: unknown): v is ServiceVerificationEntry & { environment?: unknown } {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.at === "string" &&
    typeof e.connectionId === "string" &&
    e.connectionId !== "" &&
    (e.sapClient === null || typeof e.sapClient === "string") &&
    typeof e.baseUrl === "string" &&
    e.baseUrl !== "" &&
    (e.environment === undefined || (typeof e.environment === "string" && e.environment !== ""))
  );
}

/**
 * The stored JSON as entries, re-keyed by binding; anything malformed is
 * dropped, never trusted. An entry's own `environment` wins over its key; a
 * first-shape entry (bare environment key, no `environment`) takes the key.
 */
export function parseServiceVerifications(json: unknown): ServiceVerifications {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return {};
  const out: ServiceVerifications = {};
  for (const [key, entry] of Object.entries(json as Record<string, unknown>)) {
    if (!isEntry(entry)) continue;
    const environment = typeof entry.environment === "string" ? entry.environment : key;
    if (environment.includes(KEY_SEPARATOR)) continue;
    out[verificationKey(environment, entry.sapClient)] = {
      environment,
      at: entry.at,
      connectionId: entry.connectionId,
      sapClient: entry.sapClient,
      baseUrl: entry.baseUrl,
    };
  }
  return out;
}

/**
 * The stored JSON with one binding's entry set (a new object). Other clients
 * of the same environment, and other environments, are kept.
 */
export function withServiceVerification(
  json: unknown,
  environment: string,
  entry: ServiceVerificationEntry,
): ServiceVerifications {
  return {
    ...parseServiceVerifications(json),
    [verificationKey(environment, entry.sapClient)]: {
      environment,
      at: entry.at,
      connectionId: entry.connectionId,
      sapClient: entry.sapClient,
      baseUrl: entry.baseUrl,
    },
  };
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
  const entry = parseServiceVerifications(json)[verificationKey(binding.environment, binding.sapClient)];
  if (!entry) return false;
  return (
    entry.environment === binding.environment &&
    entry.connectionId === binding.connectionId &&
    (entry.sapClient ?? null) === (binding.sapClient ?? null) &&
    entry.baseUrl === binding.baseUrl
  );
}

/**
 * A connection as it stands now — what an entry is compared against to say
 * whether it still describes the binding a call would use.
 */
export interface CurrentConnection {
  id: string;
  /** Normalized: SANDBOX | DEV | TEST | PROD, or null when undeclared. */
  environment: string | null;
  client: string | null;
  baseUrl: string;
}

/** The resolver's baseUrl normalization (normalizeBaseUrl), without a regex. */
export function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

/**
 * Does the entry still describe a live connection — the same id, still
 * declaring that environment and client, still on that host? An admin who
 * edits a connection's host or client keeps its id, and the write gate then
 * refuses; this lets the screen say so instead of listing it as open.
 */
export function entryMatchesConnection(
  entry: StoredServiceVerification,
  connections: readonly CurrentConnection[],
): boolean {
  return connections.some(
    (c) =>
      c.id === entry.connectionId &&
      c.environment === entry.environment &&
      (c.client ?? null) === (entry.sapClient ?? null) &&
      // The resolver normalizes the stored baseUrl the same way.
      trimTrailingSlashes(c.baseUrl) === entry.baseUrl,
  );
}

/*
 * There is deliberately no "environments holding a current verification"
 * helper here any more. "Some PROD entry matches some PROD connection" is not
 * "a PROD write would pass": a write binds through the credential's own SAP
 * client, and verifying client 100 says nothing about the client-200
 * connection that credential uses (review round 3). Readiness asks
 * verifiedEnvironmentsForCredentials (current-connections.ts), which runs the
 * write route's own connection selection per credential.
 */

const ENVIRONMENT_DISPLAY_ORDER = ["SANDBOX", "DEV", "TEST", "PROD"];

function environmentRank(env: string): number {
  const i = ENVIRONMENT_DISPLAY_ORDER.indexOf(env);
  return i === -1 ? 99 : i;
}

/**
 * For display: environment, when, which client, and whether the connection
 * that answered has changed since — never a host or an id. With no
 * connection list, every entry reads as unchanged.
 */
export function verifiedEnvironmentsForDisplay(
  json: unknown,
  connections?: readonly CurrentConnection[],
): Array<{ environment: string; at: string; sapClient: string | null; connectionChanged: boolean }> {
  return Object.values(parseServiceVerifications(json))
    .map((e) => ({
      environment: e.environment,
      at: e.at,
      sapClient: e.sapClient,
      connectionChanged: connections ? !entryMatchesConnection(e, connections) : false,
    }))
    .sort(
      (a, b) =>
        environmentRank(a.environment) - environmentRank(b.environment) ||
        (a.sapClient ?? "").localeCompare(b.sapClient ?? ""),
    );
}
