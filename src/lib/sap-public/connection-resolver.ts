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

export type SapAuthType = "basic" | "bearer" | "oauth-client-credentials";

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
  // oauth-client-credentials
  return `Bearer ${await fetchOAuthTokenFromConnection(conn)}`;
}

interface OAuthTokenResponse {
  access_token?: string;
}

async function fetchOAuthTokenFromConnection(conn: ResolvedSapConnection): Promise<string> {
  const { clientId, clientSecret } = conn.secrets;
  // OAuth token URL is a NON-secret field stored plaintext on the row, not in
  // the sealed bundle — so a UI can display/edit it without decrypting secrets.
  const url = conn.oauthTokenUrl;
  if (!url || !clientId || !clientSecret) {
    throw new Error(`Connection ${conn.key} is oauth but missing oauthTokenUrl/clientId/clientSecret`);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const json = (await res.json()) as OAuthTokenResponse;
  if (!res.ok || typeof json.access_token !== "string") {
    throw new Error(`OAuth token request failed for ${conn.key}: HTTP ${res.status}`);
  }
  return json.access_token;
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
}

/**
 * Create or update an Organization's SAP connection, sealing secrets at rest.
 * The write path that a self-service "add a connection" UI calls. Admin-gated
 * at the route layer — this helper assumes authorization already happened.
 */
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
