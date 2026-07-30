/**
 * Per-Organization SAP connection resolution — the multi-tenant keystone.
 *
 * TODAY (env-only): every request talks to the SAP tenant baked into the
 * `{PREFIX}_*` env vars (e.g. S4_TDD_*). That is a single shared connection —
 * fine for the ABeam TDD demo, wrong for "deploy into each client's own SAP".
 *
 * THIS MODULE adds a DB-backed, per-Organization connection that is resolved
 * from the caller's org, with secrets sealed at rest (connection-crypto). It is
 * ADDITIVE and NON-BREAKING: when an Organization has no stored connection,
 * `resolveSapConnections` returns [] and callers fall back to the existing env
 * path unchanged. Wiring the routes to prefer a resolved connection over env is
 * the next slice — the integration points are named in the keystone runbook.
 *
 * A ResolvedSapConnection is the connector's currency, decoupled from env:
 * baseUrl + authType + decrypted secrets, everything buildAuthHeader needs.
 * Secrets live only in memory on the resolved object — never logged, never
 * returned to a client (use `redactConnection` for anything client-facing).
 */
import { prisma } from "@/lib/db/prisma";
import type { SapTenant } from "@/lib/sap-public/tdd-connector";
import {
  connectionAad,
  openSecrets,
  sealSecrets,
  type SapConnectionSecrets,
} from "@/lib/sap-public/connection-crypto";

export type SapAuthType =
  | "basic"
  | "bearer"
  | "oauth-client-credentials"
  /**
   * OAuth 2.0 SAML bearer assertion — the SuccessFactors flow.
   *
   * NOT a variant of client-credentials. SAP is REMOVING HTTP Basic for
   * SuccessFactors APIs on 20 November 2026, and this is one of the three
   * replacements (the others being X.509 mutual TLS and OIDC via IAS). Without
   * it, every SuccessFactors connection this product can express stops working
   * on that date.
   */
  | "oauth-saml-bearer";

/** A fully-resolved connection with decrypted secrets — server-side only. */
export interface ResolvedSapConnection {
  source: "db";
  id: string;
  organizationId: string;
  product: string;
  /** tenant key (sanitized) — the key stored probes are keyed by. */
  key: string;
  label: string;
  baseUrl: string;
  authType: SapAuthType;
  secrets: SapConnectionSecrets;
  /** non-secret oauth token endpoint (null unless authType is oauth). */
  oauthTokenUrl: string | null;
  writeEnabled: boolean;
  apiPath: string | null;
  timeoutMs: number | null;
  /**
   * Which SAP landscape this row points at — "DEV" | "TEST" | "PROD", or a
   * landscape's own name. NULL means UNDECLARED, and undeclared is a state in
   * its own right, never a default: see `resolveSapConnectionForEnvironment`,
   * where it permits a read (marked unverified) and refuses a write outright.
   */
  environment: string | null;
  /**
   * The SAP client — "100", "080" — or NULL where the product has none.
   *
   * Null is the truth for every cloud product: they are one tenant per host.
   * On-premise and RISE address a client inside one system, so two connections
   * can share a baseUrl and differ only here.
   */
  client: string | null;
}

/** Client-safe projection — NO secrets, NO baseHost. Safe to serialize to a UI. */
export interface RedactedSapConnection {
  id: string;
  product: string;
  key: string;
  label: string;
  authType: SapAuthType;
  writeEnabled: boolean;
  isActive: boolean;
  hasSecrets: boolean;
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function coerceAuthType(raw: string): SapAuthType {
  if (raw === "basic" || raw === "bearer" || raw === "oauth-client-credentials") return raw;
  throw new Error(`SapConnection.authType must be basic | bearer | oauth-client-credentials (got "${raw}")`);
}

/**
 * All active connections an Organization has for a product, decrypted and
 * normalized. Returns [] when the org has none — the signal to fall back to env.
 */
export async function resolveSapConnections(
  organizationId: string,
  product: string,
): Promise<ResolvedSapConnection[]> {
  if (!organizationId) return [];
  const rows = await prisma.sapConnection.findMany({
    where: { organizationId, product, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    source: "db" as const,
    id: r.id,
    organizationId: r.organizationId,
    product: r.product,
    key: r.key,
    label: r.label,
    baseUrl: normalizeBaseUrl(r.baseUrl),
    authType: coerceAuthType(r.authType),
    // Opened under this row's own AAD, so a ciphertext copied from another
    // organization's connection cannot be decrypted here.
    secrets: openSecrets(r.secretsCiphertext, connectionAad(r.organizationId, r.product, r.key)),
    oauthTokenUrl: r.oauthTokenUrl,
    writeEnabled: r.writeEnabled,
    apiPath: r.apiPath,
    timeoutMs: r.timeoutMs,
    environment: r.environment,
    client: r.client,
  }));
}

/**
 * One connection for an org+product: the one whose key matches, else the first
 * active one, else null (→ caller uses env). Never falls back to ANOTHER org.
 */
export async function resolveSapConnection(
  organizationId: string,
  product: string,
  key?: string | null,
): Promise<ResolvedSapConnection | null> {
  const all = await resolveSapConnections(organizationId, product);
  if (all.length === 0) return null;
  if (key) return all.find((c) => c.key === key) ?? null;
  return all[0] ?? null;
}

/**
 * Resolve the connection for a CALLER'S DECLARED ENVIRONMENT — the binding the
 * broker must use, and the reason `resolveSapConnection` above is not safe on a
 * runtime path.
 *
 * THE DEFECT THIS CLOSES. `resolveSapConnection` ends at `all[0]` — the OLDEST
 * active connection for an org+product. The grant check matches an environment,
 * but it matches it against the TOKEN's environment and then stops; nothing ever
 * compared it to the connection actually called. An organization holding a PROD
 * connection created before its SANDBOX one served every call — reads AND writes
 * — from PROD, while the audit row sincerely recorded "SANDBOX". The environment
 * ladder was enforced on paper and not on the wire.
 *
 * THE RULE, and why it is split by operation. `SapConnection.environment` shipped
 * one day before this fix, so an undeclared environment is an UNBACKFILLED estate,
 * not a legacy one. Refusing every undeclared connection would break every
 * deployment on day one over a column nobody has had the chance to fill, and would
 * push operators to type a guessed value purely to clear the error — manufacturing
 * exactly the fabricated environments the console's chip exists to prevent. So:
 *
 *   - A declared connection matching the caller's environment  → use it.
 *   - Two or more matches                                      → refuse. Ambiguity
 *     must never be resolved by creation order; that is the original bug.
 *   - Undeclared, and it is the org's ONLY connection:
 *       READ  → allow, flagged `bindingUnverified` so the audit row and the
 *               operations console can both say the binding was not proven.
 *       WRITE → REFUSE, always. `writeEnabled` is no substitute: it is a
 *               per-connection yes/no that says nothing about WHICH landscape it
 *               enables writes on. A read against an undeclared landscape is a
 *               disclosure risk that already exists; a write is a record created
 *               in a customer's ledger with nobody having declared it production,
 *               and it cannot be taken back.
 *   - Anything else                                            → refuse.
 *
 * The permissive read is a BACKLOG, not a home: `bindingUnverified` is counted in
 * the operations console and is expected to trend to zero as environments are
 * declared.
 */
export type ConnectionBindingFailure =
  /** The organization has no active connection at all for this product. */
  | "NO_CONNECTION"
  /** It has connections, but none declares this environment. */
  | "NO_MATCH_FOR_ENVIRONMENT"
  /** Several candidates and no way to choose — refuse rather than guess. */
  | "AMBIGUOUS"
  /** A write against a connection that has not declared its landscape. */
  | "UNDECLARED_ENVIRONMENT_WRITE";

export type ConnectionBinding =
  | { ok: true; connection: ResolvedSapConnection; bindingUnverified: boolean }
  | { ok: false; reason: ConnectionBindingFailure };

function normalizedEnvironmentOf(conn: ResolvedSapConnection): string | null {
  const raw = conn.environment?.trim();
  return raw ? raw.toUpperCase() : null;
}

export async function resolveSapConnectionForEnvironment(
  organizationId: string,
  product: string,
  environment: string,
  operation: "READ" | "WRITE",
): Promise<ConnectionBinding> {
  const all = await resolveSapConnections(organizationId, product);
  if (all.length === 0) return { ok: false, reason: "NO_CONNECTION" };

  const target = environment.trim().toUpperCase();
  const matches = all.filter((c) => normalizedEnvironmentOf(c) === target);

  if (matches.length === 1) {
    return { ok: true, connection: matches[0]!, bindingUnverified: false };
  }
  if (matches.length > 1) return { ok: false, reason: "AMBIGUOUS" };

  const undeclared = all.filter((c) => normalizedEnvironmentOf(c) === null);
  if (undeclared.length === 0) return { ok: false, reason: "NO_MATCH_FOR_ENVIRONMENT" };

  // Undeclared candidates exist. A write never proceeds on one.
  if (operation === "WRITE") return { ok: false, reason: "UNDECLARED_ENVIRONMENT_WRITE" };

  // A read proceeds ONLY when there is nothing to confuse it with. With a
  // declared PROD row beside an undeclared one we must not assume the undeclared
  // row is the sandbox the caller asked for.
  if (all.length === 1) {
    return { ok: true, connection: all[0]!, bindingUnverified: true };
  }
  return { ok: false, reason: "AMBIGUOUS" };
}

/**
 * A safe, actionable sentence for each binding refusal.
 *
 * Lives beside the enum so adding a reason forces you to say what it means to
 * the developer whose call just failed. Never names a host, a URL, or another
 * organization's data — the caller learns what THEY must fix, nothing about the
 * estate's shape.
 */
export function connectionRefusalMessage(
  reason: ConnectionBindingFailure,
  environment: string,
): string {
  switch (reason) {
    case "NO_CONNECTION":
      return "No SAP connection is configured for this organization and product.";
    case "NO_MATCH_FOR_ENVIRONMENT":
      return `No SAP connection is configured for the ${environment} environment. This credential is bound to ${environment} and will not fall back to another landscape.`;
    case "AMBIGUOUS":
      return `More than one SAP connection could serve the ${environment} environment, so none was chosen. Declare a distinct environment on each connection in Studio.`;
    case "UNDECLARED_ENVIRONMENT_WRITE":
      return "This organization's SAP connection has not declared which environment it is, so a write cannot be authorised against it. Set the environment on the connection in Studio.";
  }
}

/** Project a resolved connection to the SapTenant shape the catalogue code uses. */
export function toSapTenant(conn: ResolvedSapConnection): SapTenant {
  return { key: conn.key, label: conn.label, baseUrl: conn.baseUrl };
}

/**
 * Build the Authorization header from a resolved connection — the DB-backed
 * sibling of the connector's env-based buildAuthHeader(prefix). Same three
 * shapes: basic, static bearer, oauth client-credentials.
 */
export async function buildAuthHeaderFromConnection(conn: ResolvedSapConnection): Promise<string> {
  const s = conn.secrets;
  if (conn.authType === "basic") {
    if (!s.username || !s.password) throw new Error(`Connection ${conn.key} is basic auth but missing username/password`);
    return `Basic ${Buffer.from(`${s.username}:${s.password}`).toString("base64")}`;
  }
  if (conn.authType === "bearer") {
    if (!s.bearerToken) throw new Error(`Connection ${conn.key} is bearer auth but missing bearerToken`);
    return `Bearer ${s.bearerToken}`;
  }
  if (conn.authType === "oauth-saml-bearer") {
    return `Bearer ${await fetchSamlBearerToken(conn)}`;
  }
  // oauth-client-credentials
  return `Bearer ${await fetchOAuthTokenFromConnection(conn)}`;
}

/**
 * Exchange a signed SAML assertion for an access token — SuccessFactors.
 *
 * SHARES THE TOKEN CACHE with client-credentials, keyed by connection id, for
 * the same reason: without it every northbound call makes two round trips and
 * hammers a rate-limited token endpoint in proportion to application traffic.
 *
 * UNVERIFIED AGAINST A LIVE TENANT. The request shape is from SAP's published
 * documentation, not from observation — no SuccessFactors system was available.
 * The parts that can be checked without one are: the cache, the timeout, the
 * expiry margin, and that a misconfiguration fails with a message naming the
 * missing field rather than a generic 400 from SAP. The end-to-end exchange
 * needs a real tenant before anyone relies on it, and the connection test is the
 * cheapest way to find out.
 */
async function fetchSamlBearerToken(
  conn: ResolvedSapConnection,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string> {
  const cached = oauthTokenCache.get(conn.id);
  if (cached && cached.expiresAt > now) return cached.token;

  const { clientId, samlAssertion, companyId } = conn.secrets;
  const url = conn.oauthTokenUrl;

  // Named individually. "oauth is misconfigured" on a five-field flow is a
  // guessing game, and this one is being set up against a deadline.
  const missing = [
    !url && "oauthTokenUrl",
    !clientId && "clientId (the SuccessFactors API key)",
    !companyId && "companyId",
    !samlAssertion && "samlAssertion",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `Connection ${conn.key} is SAML bearer auth but missing ${missing.join(", ")}.`,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchImpl(url!, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      // No Authorization header: the assertion IS the credential. Sending Basic
      // as well would be a second, weaker credential on the same request.
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:saml2-bearer",
        client_id: clientId!,
        company_id: companyId!,
        assertion: samlAssertion!,
      }),
      signal: controller.signal,
    });
    const json = (await res.json()) as OAuthTokenResponse;
    if (!res.ok || typeof json.access_token !== "string") {
      // The assertion is not echoed. It is a signed credential and a failed
      // exchange is exactly when someone copies the error into a ticket.
      throw new Error(
        `SAML bearer token request failed for ${conn.key}: HTTP ${res.status}. ` +
          "An expired or unregistered assertion is the usual cause.",
      );
    }

    const ttlMs =
      typeof json.expires_in === "number" && json.expires_in > 0
        ? json.expires_in * 1000
        : DEFAULT_TOKEN_TTL_MS;
    oauthTokenCache.set(conn.id, {
      token: json.access_token,
      expiresAt: now + Math.max(ttlMs - TOKEN_EXPIRY_MARGIN_MS, 0),
    });
    return json.access_token;
  } finally {
    clearTimeout(timer);
  }
}

interface OAuthTokenResponse {
  access_token?: string;
  /** Seconds until expiry, per RFC 6749. Absent on some SAP token endpoints. */
  expires_in?: number;
}

/**
 * Cached OAuth access tokens, keyed by connection id.
 *
 * Without this, EVERY northbound call performs a full client-credentials
 * exchange before the request it actually wants to make: two round trips per
 * read, and a token endpoint hammered in proportion to application traffic.
 * SAP's token endpoints rate-limit, so an uncached broker degrades under exactly
 * the load it is meant to serve.
 *
 * In-process only, deliberately. A shared cache would mean access tokens for
 * customers' SAP systems sitting in Redis, which is a materially worse thing to
 * leak than the cost of a cold start per instance.
 */
const oauthTokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Refresh early, so a token cannot expire mid-flight on a slow request. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

/** Exposed for tests and for a future re-seal/rotation path. */
export function clearOAuthTokenCache(): void {
  oauthTokenCache.clear();
}

async function fetchOAuthTokenFromConnection(
  conn: ResolvedSapConnection,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string> {
  const cached = oauthTokenCache.get(conn.id);
  if (cached && cached.expiresAt > now) return cached.token;

  const { clientId, clientSecret } = conn.secrets;
  // OAuth token URL is a NON-secret field stored plaintext on the row, not in
  // the sealed bundle — so a UI can display/edit it without decrypting secrets.
  const url = conn.oauthTokenUrl;
  if (!url || !clientId || !clientSecret) {
    throw new Error(`Connection ${conn.key} is oauth but missing oauthTokenUrl/clientId/clientSecret`);
  }

  // Bounded: a hung token endpoint must fail the request rather than holding it
  // open until something further up gives up.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
      signal: controller.signal,
    });
    const json = (await res.json()) as OAuthTokenResponse;
    if (!res.ok || typeof json.access_token !== "string") {
      throw new Error(`OAuth token request failed for ${conn.key}: HTTP ${res.status}`);
    }

    // Honour the server's expires_in when it gives one; never cache a token
    // right up to its expiry.
    const ttlMs =
      typeof json.expires_in === "number" && json.expires_in > 0
        ? json.expires_in * 1000
        : DEFAULT_TOKEN_TTL_MS;
    oauthTokenCache.set(conn.id, {
      token: json.access_token,
      expiresAt: now + Math.max(ttlMs - TOKEN_EXPIRY_MARGIN_MS, 0),
    });

    return json.access_token;
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam: exercise the cache and timeout without a live token endpoint. */
export async function __fetchOAuthTokenForTest(
  conn: ResolvedSapConnection,
  fetchImpl: typeof fetch,
  now?: number,
): Promise<string> {
  return fetchOAuthTokenFromConnection(conn, fetchImpl, now);
}

export interface UpsertSapConnectionInput {
  organizationId: string;
  product: string;
  key: string;
  label: string;
  baseUrl: string;
  authType: SapAuthType;
  secrets: SapConnectionSecrets;
  /** non-secret; stored plaintext on the row for oauth */
  oauthTokenUrl?: string | null;
  writeEnabled?: boolean;
  apiPath?: string | null;
  timeoutMs?: number | null;
  isActive?: boolean;
  /**
   * Which SAP environment this points at — "DEV" | "TEST" | "PROD", or the
   * landscape's own name. Omitted stays NULL, and NULL renders no chip in the
   * console: an undeclared environment must never be guessed at on the control
   * that guards production writes.
   */
  environment?: string | null;
  /**
   * The SAP client — "100", "080" — or null where the product has none.
   *
   * Validated at the API boundary (only landscapes that address a client may
   * supply one), so by the time it reaches here it is either three digits or
   * null.
   */
  client?: string | null;
}

/**
 * Create or update an Organization's SAP connection, sealing secrets at rest.
 * The write path that a self-service "add a connection" UI calls. Admin-gated
 * at the route layer — this helper assumes authorization already happened.
 */
/** Blank is not an environment. Upper-cased so the chip reads consistently. */
function normalizeEnvironment(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

export async function upsertSapConnection(input: UpsertSapConnectionInput): Promise<RedactedSapConnection> {
  // Bind the sealed bundle to (org, product, key) so it is worthless on any
  // other row — see connectionAad.
  const secretsCiphertext = sealSecrets(
    input.secrets,
    connectionAad(input.organizationId, input.product, input.key),
  );
  const row = await prisma.sapConnection.upsert({
    where: {
      organizationId_product_key: {
        organizationId: input.organizationId,
        product: input.product,
        key: input.key,
      },
    },
    create: {
      organizationId: input.organizationId,
      product: input.product,
      key: input.key,
      label: input.label,
      baseUrl: input.baseUrl,
      authType: input.authType,
      oauthTokenUrl: input.oauthTokenUrl ?? null,
      secretsCiphertext,
      writeEnabled: input.writeEnabled ?? false,
      apiPath: input.apiPath ?? null,
      timeoutMs: input.timeoutMs ?? null,
      isActive: input.isActive ?? true,
      environment: normalizeEnvironment(input.environment),
      client: input.client ?? null,
    },
    update: {
      label: input.label,
      baseUrl: input.baseUrl,
      authType: input.authType,
      oauthTokenUrl: input.oauthTokenUrl ?? null,
      secretsCiphertext,
      writeEnabled: input.writeEnabled ?? false,
      apiPath: input.apiPath ?? null,
      timeoutMs: input.timeoutMs ?? null,
      isActive: input.isActive ?? true,
      environment: normalizeEnvironment(input.environment),
      client: input.client ?? null,
    },
  });
  return redactConnection(row);
}

/** Strip secrets + host for anything that crosses the client boundary. */
export function redactConnection(row: {
  id: string;
  product: string;
  key: string;
  label: string;
  authType: string;
  writeEnabled: boolean;
  isActive: boolean;
  secretsCiphertext: string | null;
}): RedactedSapConnection {
  return {
    id: row.id,
    product: row.product,
    key: row.key,
    label: row.label,
    authType: coerceAuthType(row.authType),
    writeEnabled: row.writeEnabled,
    isActive: row.isActive,
    hasSecrets: Boolean(row.secretsCiphertext),
  };
}
