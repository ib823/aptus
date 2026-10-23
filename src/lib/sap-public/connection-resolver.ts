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
import { createHash } from "crypto";

import { Prisma } from "@prisma/client";

import { CONNECTION_GROUP_UNREADABLE_STATUS, CONNECTION_NOT_PROBED_STATUSES } from "@/lib/coreedge/freshness";
import { prisma } from "@/lib/db/prisma";
import { loadConsoleConnection, type CeilingGrantRow } from "@/lib/governed/call-loads";
import {
  DEFAULT_API_KEY_HEADER,
  isAllowedApiKeyHeader,
} from "@/lib/sap-public/api-key-header";
import { bindingFor, type BindingEstate } from "@/lib/northbound/authorisation";
import type { BindableConnection, ConnectionBindingFailure } from "@/lib/sap-public/connection-selection";
import { parseSapEnvironment, type SapEnvironment } from "@/lib/sap-public/environment";
import type { SapTenant } from "@/lib/sap-public/tdd-connector";
import { connectionAad, type SapConnectionSecrets } from "@/lib/sap-public/connection-crypto";
import { openSecretsForOrg, sealSecretsForOrg } from "@/lib/sap-public/secret-envelope";
import { exchangeSamlBearerAssertion, readTokenResponse } from "@/lib/sap-public/oauth-saml-bearer";
import { ConnectionConfigError, OAuthTokenRequestError } from "@/lib/sap-public/upstream-failure";
import { assertSuccessFactorsBasicAuthAllowed } from "./sf-basic-auth-sunset";

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
  | "oauth-saml-bearer"
  /**
   * A static API key sent in its OWN header (AD-12) — `apikey` by default.
   *
   * The other four all produce `Authorization:`. SAP's Business Accelerator
   * Hub sandbox requires `apikey` and ignores `Authorization` entirely, so
   * the obvious first experiment against SAP failed after a real host had
   * been typed into the form. Verified: `Authorization: Bearer dummy` to the
   * sandbox answers "Failed to resolve API Key variable request.header.apikey".
   */
  | "api-key";

/*
 * The api-key header rule lives in its own module because the form that offers
 * the field is a client component and cannot import anything that reaches
 * prisma. Re-exported here so the existing server-side importers are unchanged.
 */
export { DEFAULT_API_KEY_HEADER, isAllowedApiKeyHeader } from "@/lib/sap-public/api-key-header";

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
   * Which SAP landscape this row points at. NULL means UNDECLARED, and
   * undeclared is a state in its own right, never a default: see
   * `resolveSapConnectionForEnvironment`, where it permits a read (marked
   * unverified) and refuses a write outright.
   */
  environment: SapEnvironment | null;
  /**
   * The SAP client — "100", "080" — or NULL where the product has none.
   *
   * Null is the truth for every cloud product: they are one tenant per host.
   * On-premise and RISE address a client inside one system, so two connections
   * can share a baseUrl and differ only here.
   */
  client: string | null;
  /**
   * The row's settings revision when it was read (SapConnection.revision):
   * bumped by every save. A lane check made through this object records its
   * evidence only while the row still carries it (lane-check-sweep.ts
   * `recordLaneCheck`). Always set by `openConnectionRow` (from a Prisma row
   * or the governed loads, which read the column too); optional only so a
   * connection built outside the table (a test fixture) need not invent one —
   * and a check through such an object records nothing, which fails safe.
   */
  revision?: number;
  /**
   * How the governed pipeline reaches this system (P0.14,
   * src/lib/governed/transport.ts). Optional so a connection built by a
   * caller that predates the column reads as DIRECT, which every stored row
   * is unless P1.6 marks it TWIN.
   */
  transport?: "DIRECT" | "TWIN";
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
  /*
   * ALL FOUR TYPES. This function refused `oauth-saml-bearer` while everything
   * around it accepted the type: the connections route validated and persisted
   * it, `buildAuthHeaderFromConnection` dispatched it, and SAP's 20 Nov 2026
   * Basic-auth removal is the whole reason it exists. The result: storing a
   * SuccessFactors SAML connection made `resolveSapConnections` — and through
   * it the connections LIST and every northbound read for that organization —
   * throw on a row the product had just accepted. The auth path that could
   * never be reached was also "unverified against a live tenant", which is a
   * strange thing for code to be when calling it was impossible.
   */
  if (
    raw === "basic" ||
    raw === "bearer" ||
    raw === "oauth-client-credentials" ||
    raw === "oauth-saml-bearer" ||
    raw === "api-key"
  ) {
    return raw;
  }
  throw new Error(
    `SapConnection.authType must be basic | bearer | oauth-client-credentials | oauth-saml-bearer | api-key (got "${raw}")`,
  );
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
  return Promise.all(rows.map(openConnectionRow));
}

/**
 * The stored columns a connection is opened from: a Prisma row, or the same
 * columns read by the governed access load (governed/call-loads.ts, P0.19).
 */
type SapConnectionRow = Pick<
  Awaited<ReturnType<typeof prisma.sapConnection.findMany>>[number],
  | "id"
  | "organizationId"
  | "product"
  | "key"
  | "label"
  | "baseUrl"
  | "authType"
  | "oauthTokenUrl"
  | "secretsCiphertext"
  | "client"
  | "writeEnabled"
  | "apiPath"
  | "timeoutMs"
  | "revision"
> & { readonly environment: string | null; readonly transport: string };

/**
 * One stored row, decrypted and normalized. Rejects when the row cannot be opened.
 *
 * Async since P0.10: a `ce2` blob is opened under its organisation's data key,
 * which may need a database read to unwrap. A legacy blob opens as it always
 * did, through the same legacy key.
 */
async function openConnectionRow(r: SapConnectionRow): Promise<ResolvedSapConnection> {
  // Opened under this row's own AAD, so a ciphertext copied from another
  // organization's connection cannot be decrypted here.
  const secrets = await openSecretsForOrg(
    r.organizationId,
    r.secretsCiphertext,
    connectionAad(r.organizationId, r.product, r.key),
  );
  return {
    source: "db" as const,
    id: r.id,
    organizationId: r.organizationId,
    product: r.product,
    key: r.key,
    label: r.label,
    baseUrl: normalizeBaseUrl(r.baseUrl),
    authType: coerceAuthType(r.authType),
    secrets,
    oauthTokenUrl: r.oauthTokenUrl,
    writeEnabled: r.writeEnabled,
    apiPath: r.apiPath,
    timeoutMs: r.timeoutMs,
    // The column's own enums: Prisma types them, the access load reads them as text.
    environment: r.environment as SapEnvironment | null,
    client: r.client,
    revision: r.revision,
    transport: r.transport as "DIRECT" | "TWIN",
  };
}

/**
 * One connection for an org+product: the one whose key matches, else the first
 * active one, else null (→ caller uses env). Never falls back to ANOTHER org.
 */
export async function resolveSapConnection(
  organizationId: string,
  product: string,
  key?: string | null,
  options: { readonly withCeilingGrants?: boolean } = {},
): Promise<(ResolvedSapConnection & { readonly ceilingGrants?: readonly CeilingGrantRow[] }) | null> {
  if (key && options.withCeilingGrants === true) {
    /*
     * A CONSOLE READ (P0.14b review round 5): the same named row, and the
     * grants its environment ceiling judges, in ONE statement
     * (governed/call-loads.ts loadConsoleConnection), so the console's
     * authorise step needs no second round trip. The same row is chosen and
     * opened exactly as below.
     */
    if (!organizationId) return null;
    const load = await loadConsoleConnection(organizationId, product, key);
    if (!load.connection || load.connection.key !== key) return null;
    return { ...(await openConnectionRow(load.connection)), ceilingGrants: load.grants };
  }
  if (key) {
    /*
     * A NAMED KEY OPENS ONLY THAT ROW. This used to open every active row for
     * the org and product and then pick one, so a single sibling that would
     * not decrypt — sealed under a previous SAP_CONNECTION_ENCRYPTION_KEY, or
     * restored from a backup — threw for every key, including a healthy one.
     * Every console read of a perfectly good connection then failed because of
     * a different connection the user had not asked for.
     *
     * Skipping a bad row is safe HERE and not in the environment binding
     * below: a key names exactly one row (`@@unique([organizationId, product,
     * key])`), so no other row could be chosen in its place. The key is also
     * checked again before opening, so a broader result can never open a row
     * the caller did not name. The named row itself being unreadable still
     * throws; the caller decides what that means.
     */
    if (!organizationId) return null;
    const rows = await prisma.sapConnection.findMany({
      where: { organizationId, product, key, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    const row = rows.find((r) => r.key === key);
    return row ? await openConnectionRow(row) : null;
  }
  const all = await resolveSapConnections(organizationId, product);
  return all[0] ?? null;
}

/**
 * Whether an organization has an ACTIVE connection under this key, without
 * opening it. For a caller that only needs to know the row exists: decrypting
 * secrets to answer that question would make a broken row fail a check that
 * never needed its credentials.
 */
export async function hasActiveSapConnection(
  organizationId: string,
  product: string,
  key: string,
): Promise<boolean> {
  if (!organizationId || !key) return false;
  const rows = await prisma.sapConnection.findMany({
    where: { organizationId, product, key, isActive: true },
    select: { key: true },
    take: 1,
  });
  return rows.some((r) => r.key === key);
}

/**
 * The API-key header name sealed in a stored connection, or null: the only
 * value this returns from the bundle, never a secret (wave 2 rotation probe
 * review round 2). The Connections form cannot read the header back, so a
 * re-save that leaves its Header name blank asks the save route to keep the
 * stored one rather than reset it to `apikey`.
 *
 * Read from the row the save judged (`judged`: its id and revision), active
 * or not, since a re-save may bring a deactivated row back. Null when that
 * row is gone or changed, is not an API-key connection, will not open,
 * stores no header (the default) or stores one the header rule refuses; the
 * save then sends what it sent before, the default.
 */
export async function storedApiKeyHeader(
  organizationId: string,
  product: string,
  key: string,
  judged: { readonly id: string; readonly revision: number },
): Promise<string | null> {
  if (!organizationId || !key) return null;
  const row = await prisma.sapConnection.findFirst({ where: { organizationId, product, key } });
  if (!row || row.id !== judged.id || row.revision !== judged.revision || row.authType !== "api-key") return null;
  try {
    const header = (await openConnectionRow(row)).secrets.apiKeyHeader?.trim();
    return header && isAllowedApiKeyHeader(header) ? header : null;
  } catch {
    return null;
  }
}

export {
  selectConnectionForEnvironment,
  type BindableConnection,
  type ConnectionBindingFailure,
  type ConnectionSelection,
} from "@/lib/sap-public/connection-selection";

export type ConnectionBinding =
  | { ok: true; connection: ResolvedSapConnection; bindingUnverified: boolean }
  | { ok: false; reason: ConnectionBindingFailure };

/** A connection as the binding PREVIEW sees it: identity and the two binding fields, no secret. */
export interface BindableConnectionSummary extends BindableConnection {
  key: string;
  label: string;
  product: string;
  /** How the broker reaches it (transport.ts): discovery's `callable` asks `transportRefusal` of it. */
  transport?: string;
}

/**
 * The organization's active connections for a product, METADATA ONLY — the
 * same rows resolveSapConnections opens, without opening them. For a surface
 * that needs to say which connection a credential would bind to (the Test
 * Console, before Run) and has no business holding a decrypted secret to say
 * it. Same where-clause and order as the decrypting read, so the preview and
 * the run see the same estate.
 */
export async function listBindableConnections(
  organizationId: string,
  product: string,
): Promise<BindableConnectionSummary[]> {
  if (!organizationId) return [];
  return prisma.sapConnection.findMany({
    where: { organizationId, product, isActive: true },
    select: { key: true, label: true, product: true, environment: true, client: true, transport: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function resolveSapConnectionForEnvironment(
  organizationId: string,
  product: string,
  environment: string,
  operation: "READ" | "WRITE",
  /**
   * The SAP client the CALLER'S CREDENTIAL is bound to, or null when it names
   * none. Optional so the many callers on products without an SAP client stay
   * unchanged; passing null and omitting it mean the same thing.
   */
  sapClient?: string | null,
): Promise<ConnectionBinding> {
  /*
   * A ROW THAT CANNOT BE RESOLVED IS A REFUSAL, NOT A CRASH. `resolveSapConnections`
   * throws on an unrecognised authType or secrets that fail to open — and that
   * throw used to escape the northbound routes as an unhandled 500 with no
   * audit row. It is caught HERE and not per-caller so every binding path gets
   * the same behaviour. Fail-closed on the whole set, deliberately: skipping
   * just the bad row could bind the call to a DIFFERENT connection than the
   * estate intended, which is the cross-landscape routing this module exists
   * to prevent.
   */
  // The estate, then the one binding predicate the lane board asks too (P0.2;
  // binding.ts loadBindingEstate builds the same estate for the board).
  let estate: BindingEstate<ResolvedSapConnection>;
  try {
    estate = { kind: "connections", connections: await resolveSapConnections(organizationId, product) };
  } catch {
    estate = { kind: "unreadable" };
  }
  return bindingFor(estate, environment, operation === "WRITE" ? "write" : "read", sapClient);
}

/**
 * `resolveSapConnectionForEnvironment` on rows already read: the active
 * connections of one organisation for one product, oldest first, as the
 * governed access load reads them in the interface's statement (P0.19). The
 * same opening, the same fail-closed estate, and the same one binding
 * predicate (P0.2 authorisation.ts `bindingFor`) the lane board asks.
 */
export async function bindStoredConnections(
  rows: readonly SapConnectionRow[],
  environment: string,
  operation: "READ" | "WRITE",
  sapClient?: string | null,
): Promise<ConnectionBinding> {
  let estate: BindingEstate<ResolvedSapConnection>;
  try {
    estate = { kind: "connections", connections: await Promise.all(rows.map(openConnectionRow)) };
  } catch {
    estate = { kind: "unreadable" };
  }
  return bindingFor(estate, environment, operation === "WRITE" ? "write" : "read", sapClient);
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
    case "NO_MATCH_FOR_CLIENT":
      return `A SAP connection is configured for the ${environment} environment, but none of them addresses the SAP client this credential is bound to. A client is a separate data container inside the same system, so this will not fall back to another one. Add the connection for that client in Studio, or re-issue this credential against a client that exists.`;
    case "AMBIGUOUS":
      return `More than one SAP connection could serve the ${environment} environment, so none was chosen. Declare a distinct environment on each connection in Studio — or, where one system hosts several SAP clients, set the client on each connection and on this credential so the pair identifies exactly one.`;
    case "NO_DECLARED_CANDIDATE":
      return `No SAP connection declares the ${environment} environment, and more than one connection has not declared its environment at all — so none can be assumed to be it. Set the environment on each undeclared connection in Studio; this credential will not guess between them.`;
    case "UNDECLARED_ENVIRONMENT_WRITE":
      return "This organization's SAP connection has not declared which environment it is, so a write cannot be authorised against it. Set the environment on the connection in Studio.";
    case "CONNECTION_UNREADABLE":
      return "A stored SAP connection for this organization could not be read (its credentials failed to open or its auth type is unrecognised). Re-save the connection's secrets in Studio, or deactivate the broken row.";
    case "UNKNOWN_PRODUCT":
      return "This interface names an SAP product the platform does not recognise, so no connection can ever serve it. Fix the interface's product in Studio — adding a connection will not help.";
  }
}

/**
 * Project a resolved connection to the SapTenant shape the catalogue code uses.
 *
 * CARRIES `client` AND `environment`. This projection dropped both, and it sits
 * on EVERY read path that resolves a stored connection (entities, preview,
 * operations, capabilities, hub-content, probe-all, via resolveReadTenant) —
 * so `serviceUrl` never received a client and `sap-client` was never appended
 * to a read URL, on exactly the two products (`cloud-erp-private`,
 * `s4hana-onprem`) whose `addressesClient: true` exists for it. That is the
 * "read one client, write to another, and the request would succeed" hazard
 * sap-url.ts was written to prevent, reintroduced by a lossy projection.
 */
export function toSapTenant(conn: ResolvedSapConnection): SapTenant {
  return {
    key: conn.key,
    label: conn.label,
    baseUrl: conn.baseUrl,
    ...(conn.environment ? { environment: conn.environment } : {}),
    ...(conn.client ? { client: conn.client } : {}),
    /*
     * AND THE CREDENTIALS. This projection carried the customer's host and
     * nothing to authenticate to it with, so every `/api/sap/tdd/*` read that
     * resolved a stored connection sent the DEPLOYMENT's env credentials to the
     * CUSTOMER's baseUrl — the mirror image of the cross-tenant read the
     * broker was written to prevent. The provider opens this row's own sealed
     * secrets, lazily, only when a request is built.
     */
    authorization: () => buildAuthHeaderFromConnection(conn),
    // The header PAIR — the form every request should spread, because an
    // api-key connection has no Authorization value to give (AD-12).
    authHeaders: () => buildAuthHeadersFromConnection(conn),
  };
}

/**
 * THE REQUEST HEADERS a connection authenticates with — as a record, because
 * the header is not always `Authorization`. Four types answer
 * `{ Authorization: … }`; `api-key` answers `{ [apiKeyHeader]: apiKey }`.
 * Every request path that reaches a stored connection spreads this; the
 * string-returning builder below stays for the four types that have one.
 */
export async function buildAuthHeadersFromConnection(
  conn: ResolvedSapConnection,
): Promise<Record<string, string>> {
  /*
   * EVERY REFUSAL BELOW IS A ConnectionConfigError, not a plain Error (audit
   * A08, A20): each is a setup problem raised before anything is sent, and a
   * plain Error was read by every caller as "the upstream never answered" —
   * SAP unavailable — when SAP was never asked. See upstream-failure.ts.
   */
  if (conn.authType === "api-key") {
    const s = conn.secrets;
    if (!s.apiKey) {
      throw new ConnectionConfigError(
        `Connection ${conn.key} is api-key auth but missing apiKey`,
        "This connection is api-key auth but has no API key. Save it again with the key filled in.",
      );
    }
    const header = s.apiKeyHeader?.trim() || DEFAULT_API_KEY_HEADER;
    // A stored row can name a header the current validator would refuse. Fail
    // the call rather than send the key in a header that means something else.
    if (!isAllowedApiKeyHeader(header)) {
      throw new ConnectionConfigError(
        `Connection ${conn.key} names "${header}" as its API-key header, which is reserved for the transport. Re-save the connection with a header of its own.`,
        "This connection names a reserved header as its API-key header. Save it again with a header of its own.",
      );
    }
    return { [header]: s.apiKey };
  }
  return { Authorization: await buildAuthHeaderFromConnection(conn) };
}

/**
 * Build the Authorization header from a resolved connection — the DB-backed
 * sibling of the connector's env-based buildAuthHeader(prefix). Same shapes:
 * basic, static bearer, oauth client-credentials, SAML bearer. An `api-key`
 * connection has NO Authorization value and throws here by design — its
 * header comes from buildAuthHeadersFromConnection.
 */
export async function buildAuthHeaderFromConnection(conn: ResolvedSapConnection): Promise<string> {
  const s = conn.secrets;
  if (conn.authType === "api-key") {
    throw new Error(
      `Connection ${conn.key} authenticates with an API-key header, not Authorization — use buildAuthHeadersFromConnection`,
    );
  }
  if (conn.authType === "basic") {
    // SuccessFactors: warn while SAP still accepts Basic (retired 2026-11-20,
    // deletion tentative 2027-11-12), refuse only once it is actually deleted —
    // with instructions, rather than let SAP answer 401 without any.
    assertSuccessFactorsBasicAuthAllowed(conn.product, conn.authType, `connection ${conn.key}`);
    if (!s.username || !s.password) {
      throw new ConnectionConfigError(
        `Connection ${conn.key} is basic auth but missing username/password`,
        "This connection is basic auth but is missing its username or password. Save it again with both filled in.",
      );
    }
    return `Basic ${Buffer.from(`${s.username}:${s.password}`).toString("base64")}`;
  }
  if (conn.authType === "bearer") {
    if (!s.bearerToken) {
      throw new ConnectionConfigError(
        `Connection ${conn.key} is bearer auth but missing bearerToken`,
        "This connection is bearer auth but has no token. Save it again with the token filled in.",
      );
    }
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
 * expiry margin, that a misconfiguration fails with a message naming the
 * missing field rather than a generic 400 from SAP, and — when the connection
 * holds the signing key — that the assertion CoreEdge signs verifies under
 * xmlsec1. The end-to-end exchange needs a real tenant before anyone relies on
 * it, and the connection test is the cheapest way to find out.
 *
 * The token is cached, not the assertion: a signed assertion is used once and
 * thrown away, and the next exchange signs another.
 */
async function fetchSamlBearerToken(
  conn: ResolvedSapConnection,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string> {
  const fingerprint = tokenFingerprint(conn);
  const cached = oauthTokenCache.get(conn.id);
  if (cached && cached.fingerprint === fingerprint && cached.expiresAt > now) return cached.token;

  const { clientId, samlAssertion, companyId, samlPrivateKey, samlUserId } = conn.secrets;

  // THE EXCHANGE ITSELF LIVES IN oauth-saml-bearer.ts, shared with the env
  // tenant path in tdd-connector. Validation (each missing field named), the
  // request shape and the no-echo rule for the assertion are all there; this
  // function owns only the cache, which is the one thing that differs between
  // a stored connection (keyed by row id) and an env tenant (keyed by prefix).
  const { accessToken, ttlMs } = await exchangeSamlBearerAssertion(
    { tokenUrl: conn.oauthTokenUrl, clientId, companyId, samlAssertion, samlPrivateKey, samlUserId },
    `Connection ${conn.key}`,
    { fetchImpl, timeoutMs: TOKEN_REQUEST_TIMEOUT_MS },
  );

  oauthTokenCache.set(conn.id, {
    fingerprint,
    token: accessToken,
    expiresAt: now + Math.max((ttlMs ?? DEFAULT_TOKEN_TTL_MS) - TOKEN_EXPIRY_MARGIN_MS, 0),
  });
  return accessToken;
}

interface OAuthTokenResponse {
  access_token?: string;
  /** Seconds until expiry, per RFC 6749. Absent on some SAP token endpoints. */
  expires_in?: number;
}

/**
 * Cached OAuth access tokens, keyed by connection id and checked against
 * `tokenFingerprint`.
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
const oauthTokenCache = new Map<string, { fingerprint: string; token: string; expiresAt: number }>();

/**
 * What a cached token was minted FROM, so a re-save cannot be answered by it.
 *
 * Saving a connection under its existing key updates the row in place, so the
 * id stays the same. Keyed by id alone, the cache went on serving the old
 * credentials' token for that token's whole life — about a day for
 * SuccessFactors — and a Test pressed after a key rotation reported OK without
 * the new key, user or host ever being used. Any change to the auth type, the
 * host the token is sent to, the token endpoint or a secret changes this, and
 * the next call exchanges afresh. It is computed from the row as read, so it
 * holds across instances, and the entry is replaced rather than added to, so
 * the cache stays one entry per connection.
 */
function tokenFingerprint(conn: ResolvedSapConnection): string {
  const secrets = Object.entries(conn.secrets).sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256")
    .update(JSON.stringify([conn.authType, conn.baseUrl, conn.oauthTokenUrl, secrets]))
    .digest("hex");
}

/** Refresh early, so a token cannot expire mid-flight on a slow request. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;
/**
 * How long a token exchange may take — client-credentials and SAML bearer
 * alike. Exported so a caller whose credential step timed out can name THIS
 * limit and the token endpoint, not the tenant's read timeout.
 */
export const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

/** Exposed for tests. A re-save needs no call: the fingerprint misses. */
export function clearOAuthTokenCache(): void {
  oauthTokenCache.clear();
}

async function fetchOAuthTokenFromConnection(
  conn: ResolvedSapConnection,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string> {
  const fingerprint = tokenFingerprint(conn);
  const cached = oauthTokenCache.get(conn.id);
  if (cached && cached.fingerprint === fingerprint && cached.expiresAt > now) return cached.token;

  const { clientId, clientSecret } = conn.secrets;
  // OAuth token URL is a NON-secret field stored plaintext on the row, not in
  // the sealed bundle — so a UI can display/edit it without decrypting secrets.
  const url = conn.oauthTokenUrl;
  if (!url || !clientId || !clientSecret) {
    throw new ConnectionConfigError(
      `Connection ${conn.key} is oauth but missing oauthTokenUrl/clientId/clientSecret`,
      "This connection is OAuth client-credentials but is missing its token URL, client id or client secret. Save it again with all three filled in.",
    );
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
    // An error page is HTML as often as JSON. Parsed strictly, a 503 from a
    // load balancer threw a SyntaxError that said nothing about the status.
    // Only the parse is forgiven: a body cut off by the timeout is still one.
    // Read no further than a token answer can be (readTokenResponse, 64 KiB):
    // the token URL is the builder's, and fetch inflates without a limit.
    const json: OAuthTokenResponse = await readTokenResponse(res);
    if (!res.ok || typeof json.access_token !== "string") {
      // The STATUS travels as a field: a 401 here is a wrong client secret, a
      // 503 is the endpoint down, and only the status tells them apart.
      throw new OAuthTokenRequestError(`OAuth token request failed for ${conn.key}: HTTP ${res.status}`, res.status);
    }

    // Honour the server's expires_in when it gives one; never cache a token
    // right up to its expiry.
    const ttlMs =
      typeof json.expires_in === "number" && json.expires_in > 0
        ? json.expires_in * 1000
        : DEFAULT_TOKEN_TTL_MS;
    oauthTokenCache.set(conn.id, {
      fingerprint,
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
   * The landscape this system serves. Omitted or NULL stays undeclared, and
   * undeclared renders no chip in the console: it must never be guessed at on
   * the control that guards production writes.
   *
   * Typed as the enum rather than a string so a caller cannot hand in a word the
   * column cannot hold and discover, at the database, that it became NULL.
   * `parseSapEnvironment` is where a string crosses over.
   */
  environment?: SapEnvironment | null;
  /**
   * The SAP client — "100", "080" — or null where the product has none.
   *
   * Validated at the API boundary (only landscapes that address a client may
   * supply one), so by the time it reaches here it is either three digits or
   * null.
   */
  client?: string | null;
  /**
   * The row as the caller judged it, or null when it judged the key new
   * (P0.3 review round 3). The write happens only while the row is still
   * exactly that — locked and compared in the transaction that writes it —
   * and otherwise throws `SapConnectionChangedError` and changes nothing.
   * Omitted: an unguarded upsert, as before.
   */
  expectedRow?: JudgedSapConnection | null;
}

/**
 * What a save decided on: the fields that say whether, and on which system,
 * the row's writes are live, and its `revision` (bumped by every re-save).
 */
export interface JudgedSapConnection {
  readonly id: string;
  readonly isActive: boolean;
  readonly writeEnabled: boolean;
  readonly environment: SapEnvironment | null;
  readonly baseUrl: string;
  readonly client: string | null;
  readonly revision: number;
}

/**
 * The row is no longer the one the save was judged on (P0.3 review round 3):
 * someone deactivated it, toggled its writes, re-saved it, or created the key,
 * between the caller's read and this write. Nothing was written.
 */
export class SapConnectionChangedError extends Error {
  constructor() {
    super("The connection changed between the save's check and its write; nothing was written.");
    this.name = "SapConnectionChangedError";
  }
}

function isJudgedRow(row: JudgedSapConnection | null, judged: JudgedSapConnection | null): boolean {
  if (row === null || judged === null) return row === judged;
  return (
    row.id === judged.id &&
    row.isActive === judged.isActive &&
    row.writeEnabled === judged.writeEnabled &&
    row.environment === judged.environment &&
    row.baseUrl === judged.baseUrl &&
    row.client === judged.client &&
    row.revision === judged.revision
  );
}

/**
 * Create or update an Organization's SAP connection, sealing secrets at rest.
 * The write path that a self-service "add a connection" UI calls. Admin-gated
 * at the route layer — this helper assumes authorization already happened.
 */
/**
 * Blank is not an environment. Upper-cased so the chip reads consistently.
 *
 * EXPORTED because the write path is no longer the only caller: the
 * connections route compares a proposed environment against stored ones to
 * refuse indistinguishable twins, and the stored side is whatever THIS
 * function produced. A second spelling of "normalize" there would let
 * "dev" slip past a row stored as "DEV" — one fact, one definition.
 */
export function normalizeEnvironment(value: string | null | undefined): SapEnvironment | null {
  return parseSapEnvironment(value);
}

export async function upsertSapConnection(input: UpsertSapConnectionInput): Promise<RedactedSapConnection> {
  // Bind the sealed bundle to (org, product, key) so it is worthless on any
  // other row — see connectionAad. Sealed in the format the deployment
  // configures (secret-envelope.ts): legacy until an active master key is named.
  const secretsCiphertext = await sealSecretsForOrg(
    input.organizationId,
    input.secrets,
    connectionAad(input.organizationId, input.product, input.key),
  );
  /*
   * A RE-SAVE REPLACES WHAT THE EVIDENCE PROVED (P0.2, A18, A50, A60). The
   * lane board uses a check only while it was made through the connection the
   * broker binds — but a re-save keeps the row's id and changes its host,
   * client or secret in place, so the id alone cannot tell the old proof from
   * the new system. So, in the same transaction:
   *
   *   - the lane checks and the per-service health made through this
   *     connection are dropped: its lanes read Unknown and its services
   *     unproven until the next check (the nightly sweep, or Re-check), never
   *     Live or "readable" on the previous system's proof;
   *   - its probe status and last success are cleared: it reads "never
   *     tested" until the next probe, not healthy on the old tenant's 200;
   *   - its `revision` is bumped, so a lane check already reading through the
   *     previous settings records nothing when it finishes
   *     (lane-check-sweep.ts `recordLaneCheck`). Without it, a check that
   *     started before this save wrote the old system's proof under this id
   *     after the deletes above.
   *
   * All of these are caches of the latest result, not records; the probe
   * history (SapConnectionProbeEvent) and the call audit are untouched, and
   * the history is what the next probe's drift alert is judged against: a
   * failing first probe after a re-save of a connection that last probed OK
   * is still mailed (connection-probe-sweep.ts `driftBaseline`). A probe
   * already running against the previous settings records nothing when it
   * finishes, for the same revision reason as a lane check
   * (connection-probe-sweep.ts `revisionGuard`).
   *
   * EXCEPT GROUP_UNREADABLE (P0.2 review round 6). That status is not about
   * this row's settings: it says another connection for the product will not
   * open, so the broker refuses every call through this one. Re-entering this
   * row's secret — the natural reaction to a refused row, and the wrong row —
   * changes nothing of that, so the status stays. Clearing it turned the row
   * neutral ("never tested"), dropped the line naming the row to fix, and took
   * it out of the unhealthy-connection count while every call was still
   * refused. The caller's settle (connection-probe-sweep.ts
   * `settleConnectionGroup`) removes it, to "never tested", once the set
   * opens — straight away when this save is what fixed the set (for instance
   * the other row was deactivated meanwhile) — and writes it when the set
   * still does not open, whatever the row held before (round 7).
   */
  const guarded = input.expectedRow !== undefined;
  // A guarded save reads the status from the row it locks, below.
  const before = guarded
    ? null
    : await prisma.sapConnection.findFirst({
        where: { organizationId: input.organizationId, product: input.product, key: input.key },
        select: { lastValidationStatus: true },
      });
  const keep = (status: string | null | undefined) =>
    status === CONNECTION_GROUP_UNREADABLE_STATUS ? CONNECTION_GROUP_UNREADABLE_STATUS : null;
  const createData = {
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
  } satisfies Prisma.SapConnectionUncheckedCreateInput;
  let row: Prisma.SapConnectionGetPayload<object>;
  try {
    row = await prisma.$transaction(async (tx) => {
      let keptStatus = keep(before?.lastValidationStatus);
      /*
       * THE CHECK AND THE WRITE ARE ONE STEP (P0.3 review round 3). The caller
       * decided what this save does — whether it turns writes on, reactivates
       * the row, moves writes to another system — from a read made before its
       * passkey check and the sealing above. An operator's Deactivate landing
       * in that gap was overwritten by `isActive: true`, and the response, the
       * step-up action and the audit row all described the row as it had
       * been. So the row is locked here and compared with what the caller
       * judged; a Deactivate or another save waits for this transaction, or
       * this one sees it and writes nothing.
       */
      if (guarded) {
        const locked = await tx.$queryRaw<(JudgedSapConnection & { lastValidationStatus: string | null })[]>`
          SELECT "id", "isActive", "writeEnabled", "environment"::text AS "environment", "baseUrl", "client",
                 "revision", "lastValidationStatus"
          FROM "SapConnection"
          WHERE "organizationId" = ${input.organizationId} AND "product" = ${input.product} AND "key" = ${input.key}
          FOR UPDATE`;
        const current = locked[0] ?? null;
        if (!isJudgedRow(current, input.expectedRow ?? null)) throw new SapConnectionChangedError();
        // Judged new: create, never update — a row created meanwhile is a change too.
        if (current === null) return tx.sapConnection.create({ data: createData });
        keptStatus = keep(current.lastValidationStatus);
      }
      const saved = await tx.sapConnection.upsert({
        where: {
          organizationId_product_key: {
            organizationId: input.organizationId,
            product: input.product,
            key: input.key,
          },
        },
        create: createData,
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
          revision: { increment: 1 },
          lastValidationStatus: keptStatus,
          lastValidatedAt: null,
        },
      });
      const dropped = { where: { organizationId: input.organizationId, connectionId: saved.id } };
      await tx.laneCheck.deleteMany(dropped);
      await tx.sapServiceHealth.deleteMany(dropped);
      return saved;
    });
  } catch (error) {
    /*
     * A key judged new and created by someone else meanwhile: the unique
     * (organization, product, key) index refuses the create. Said as the
     * change it is; any other refusal (a twin activated meanwhile) is not.
     */
    if (
      guarded &&
      input.expectedRow === null &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const created = await prisma.sapConnection.findFirst({
        where: { organizationId: input.organizationId, product: input.product, key: input.key },
        select: { id: true },
      });
      if (created) throw new SapConnectionChangedError();
    }
    throw error;
  }
  /*
   * Nothing runs here after the commit (P0.2 review round 7). A re-save
   * changes which secrets the broker must open for the product, so the
   * group's statuses are brought in line afterwards — by the caller, after it
   * has recorded who made the change (Studio's POST calls
   * connection-probe-sweep.ts `settleConnectionGroup` after its audit row).
   * Run here, a database fault in that follow-up threw out of a save that had
   * already committed: the route told the builder "not saved" and wrote no
   * audit row for new credentials that were live.
   */
  return redactConnection(row);
}

/**
 * THE GROUP OPENS AGAIN: ITS "WILL NOT OPEN" STATUSES STOP STANDING (P0.2
 * review round 5).
 *
 * The broker fails closed on an (organization, product) set whose secrets will
 * not all open, so the probe writers record UNREADABLE on the row that will
 * not open and GROUP_UNREADABLE on each sibling that does. The answer they
 * give says what to do: re-save that connection's secrets, or deactivate it.
 * Both change that row alone — so after the fix the broker served every call
 * again while the healthy siblings kept GROUP_UNREADABLE until the next
 * nightly probe, up to 24 hours: "unreadable" on Operations, Studio and SAP
 * systems, a MAJOR unhealthy-connection incident, and an operator told their
 * fix had not worked. The reverse of A.3.
 *
 * So the places a row can leave, join or mend the set — Studio's save and its
 * Deactivate and Activate toggles, through connection-probe-sweep.ts
 * `settleConnectionGroup` (round 7) — ask the broker's own question
 * afterwards: does the set open now (`resolveSapConnections`, the read the
 * binding path fails closed on)? When it does, no active row of it is
 * unreadable any more, and the statuses that said so are cleared to "never
 * tested" — not to OK: no probe has run. `lastValidatedAt` (the last time SAP
 * answered) and the probe history the drift alert is judged against are left
 * alone. When the set still will not open (another sibling is broken too),
 * nothing changes: the broker still refuses, and the statuses still say so.
 *
 * That leaves a null status beside a last success time, which nothing else
 * writes. Every reader decides from the status (freshness.ts
 * `connectionHealthVerdict`), so it reads "never tested" everywhere: the
 * topology lens once read the time alone and drew such a row green, however
 * old the success (round 7).
 *
 * "Never tested" loses nothing a probe found (P0.2 review round 6):
 * GROUP_UNREADABLE is never written over a failure SAP reported
 * (connection-probe-sweep.ts `keepsOverGroupUnreadable`), so a sibling SAP
 * was refusing keeps that refusal throughout. Activate is a door too (round
 * 6): a sibling that was inactive while the fix was made held its
 * GROUP_UNREADABLE, out of reach of an active-rows clear, and brought it back
 * on reactivation while the broker served. And the probe writers run this
 * after writing their marks, so a fix that commits while they attribute the
 * group cannot leave a mark behind (`clearIfFixedMeanwhile`).
 *
 * Compare-and-set on the status itself, so a probe that recorded a real
 * outcome in the meantime is never overwritten. Returns how many rows changed.
 */
export async function clearUnreadableOnceGroupOpens(organizationId: string, product: string): Promise<number> {
  const unopenable = { in: [...CONNECTION_NOT_PROBED_STATUSES] };
  const marked = await prisma.sapConnection.findMany({
    where: { organizationId, product, isActive: true, lastValidationStatus: unopenable },
    select: { id: true },
  });
  if (marked.length === 0) return 0;
  try {
    await resolveSapConnections(organizationId, product);
  } catch {
    // Still will not open: the statuses are still true.
    return 0;
  }
  const cleared = await prisma.sapConnection.updateMany({
    where: {
      id: { in: marked.map((m) => m.id) },
      organizationId,
      product,
      isActive: true,
      lastValidationStatus: unopenable,
    },
    data: { lastValidationStatus: null },
  });
  return cleared.count;
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
