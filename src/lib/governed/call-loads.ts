/**
 * The governed call's two reads, one SQL statement each (P0.19), and the
 * Workbench console's connection read with its ceiling's grants (P0.14b
 * review round 5, `loadConsoleConnection`).
 *
 * WHY. The database budget for a governed read is four round trips
 * (src/lib/governed/db-budget.ts), and the checks had grown to seven: the
 * key by its hash, by its previous hash and among the retired keys (P0.11),
 * the owning solution's status, the interface, its grants and the
 * connections. Prisma, without the `relationJoins` preview, sends one
 * statement per model, and the credential row has no relation to its
 * solution, so no Prisma query can merge them. These two statements fetch
 * exactly the rows those queries fetched, in one round trip each; the
 * DECISIONS are unchanged and still made in TypeScript, by the same
 * functions (auth.ts, access.ts, connection-resolver.ts).
 *
 * THE REFERENCE. Each statement is defined as the Prisma queries it
 * replaces, named beside it (`CREDENTIAL_LOOKUP_REFERENCE`,
 * `ACCESS_LOAD_REFERENCE`). tests/integration/governed-call-loads.test.ts
 * runs both against PostgreSQL over the same rows, another organisation's
 * included, and requires the same answer; the unit and property tests
 * answer these statements through those reference queries
 * (tests/helpers/governed-loads.ts), so every fake that evaluates the
 * broker's `where` clauses still does.
 *
 * NOT SEEN BY THE TENANT GUARD. The guard (lib/db/tenant-guard.ts) inspects
 * Prisma model operations; a raw statement passes it by. So the scoping the
 * guard would demand is written into the SQL and pinned by
 * tests/unit/governed/call-loads-sql.test.ts: every tenant table the access
 * load and the console connection load read is filtered by the caller's
 * organizationId, and the credential
 * lookup's only unscoped predicates are equalities on a token hash — the
 * three lookups `UNSCOPED_BY_DESIGN` already sanctions.
 *
 * Each statement starts with a marker comment (`governed:credential-lookup`,
 * `governed:access-load`, `governed:console-connection`) so a test double can
 * tell them apart.
 */

import { prisma } from "@/lib/db/prisma";

/* ── shared ──────────────────────────────────────────────────────────── */

/**
 * A `timestamp(3)` column read inside json_build_object: PostgreSQL renders it
 * without a zone ("2026-10-21T09:10:46.123"), and Prisma stores DateTime as
 * UTC, so it is read as UTC. A value already carrying an offset is read as is.
 */
export function utcTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const text = String(value);
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`);
}

/* ── the credential ─────────────────────────────────────────────────── */

/** How the presented token matched its row. */
export type CredentialMatch = "current" | "previous" | "retired";

export interface CredentialRow {
  readonly id: string;
  readonly organizationId: string;
  readonly solutionId: string;
  readonly environment: string;
  readonly sapClient: string | null;
  readonly isActive: boolean;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly previousValidUntil: Date | null;
  readonly lastUsedAt: Date | null;
  /** Compared with `overlapForTokenHash` (key-policy.ts overlapStillBound); never leaves auth.ts. */
  readonly tokenHash: string;
  readonly overlapForTokenHash: string | null;
}

export interface CredentialLookup {
  readonly row: CredentialRow;
  readonly match: CredentialMatch;
  /** The owning solution's status, or null when the row is gone (SOLUTION_MISSING). */
  readonly solutionStatus: string | null;
  /** The sealed write key, only when asked for (the write route). */
  readonly secretsCiphertext: string | null;
}

/**
 * The Prisma queries the credential lookup replaces, in their order: the
 * current key, then (on a miss) the previous key, then (on a miss of both)
 * the retired keys; then the owning solution, scoped by the row's own
 * organization. The first match wins.
 */
export const CREDENTIAL_LOOKUP_REFERENCE = [
  "solutionClient.findUnique({ where: { tokenHash } })",
  "solutionClient.findUnique({ where: { previousTokenHash: tokenHash } })",
  "retiredClientToken.findUnique({ where: { tokenHash }, select: { client } })",
  "solution.findFirst({ where: { id: row.solutionId, organizationId: row.organizationId } })",
] as const;

interface CredentialSqlRow extends CredentialRow {
  readonly match: CredentialMatch;
  readonly solutionStatus: string | null;
  readonly secretsCiphertext: string | null;
}

/**
 * The row a token hash names, and its solution's status, in ONE statement.
 *
 * Three index probes (the `tokenHash` and `previousTokenHash` unique indexes,
 * the RetiredClientToken primary key), ranked as the reference ranks them,
 * left-joined to the solution. `withWriteKey` adds the sealed write key, so
 * the write route needs no second read of the same row; a read never selects it.
 */
export async function lookupCredential(
  tokenHash: string,
  options: { readonly withWriteKey?: boolean } = {},
): Promise<CredentialLookup | null> {
  const withWriteKey = options.withWriteKey === true;
  const rows = await prisma.$queryRaw<CredentialSqlRow[]>`/* governed:credential-lookup */
    SELECT c."id", c."organizationId", c."solutionId", c."environment"::text AS "environment", c."sapClient",
           c."isActive", c."revokedAt", c."expiresAt", c."previousValidUntil", c."lastUsedAt",
           c."tokenHash", c."overlapForTokenHash", c."match",
           CASE WHEN ${withWriteKey}::boolean THEN c."secretsCiphertext" ELSE NULL END AS "secretsCiphertext",
           s."status"::text AS "solutionStatus"
    FROM (
      SELECT k.*, 1 AS "rank", 'current' AS "match" FROM "SolutionClient" k WHERE k."tokenHash" = ${tokenHash}
      UNION ALL
      SELECT k.*, 2, 'previous' FROM "SolutionClient" k WHERE k."previousTokenHash" = ${tokenHash}
      UNION ALL
      SELECT k.*, 3, 'retired' FROM "RetiredClientToken" r JOIN "SolutionClient" k ON k."id" = r."clientId"
        WHERE r."tokenHash" = ${tokenHash}
    ) c
    LEFT JOIN "Solution" s ON s."id" = c."solutionId" AND s."organizationId" = c."organizationId"
    ORDER BY c."rank"
    LIMIT 1`;
  const found = rows[0];
  if (!found) return null;
  const { match, solutionStatus, secretsCiphertext, ...row } = found;
  return { row, match, solutionStatus: solutionStatus ?? null, secretsCiphertext: secretsCiphertext ?? null };
}

/* ── the interface, its grants and its connections ─────────────────── */

/** The interface columns the read and write decisions judge (access.ts selects the same). */
export interface InterfaceAccessRow {
  readonly id: string;
  readonly name: string;
  readonly externalId: string;
  readonly sapProduct: string;
  readonly entitySet: string | null;
  readonly operation: string;
  readonly mode: string;
  readonly version: number;
  readonly status: string;
  readonly solutionId: string;
  readonly servicePath: string | null;
  readonly odataVersion: string | null;
  readonly serviceVerifiedAt: Date | null;
  readonly serviceVerifications: unknown;
  readonly createdAt: Date;
  readonly grantMatchChangedAt: Date | null;
}

/** The grant columns access.ts GRANT_SELECT reads. */
export interface GrantAccessRow {
  /** Always present in the database; optional because access.ts's FetchedGrant reads it so. */
  readonly id?: string;
  readonly decision: string;
  readonly expiresAt: Date | null;
  readonly operation: string;
  readonly revokedAt: Date | null;
  readonly interfaceId: string | null;
  readonly sapProduct: string | null;
  readonly unboundLastUsedAt: Date | null;
  readonly createdAt: Date;
  readonly unboundCutoffAt: Date | null;
}

/** A stored connection row, as connection-resolver.ts opens it. */
export interface StoredConnectionRow {
  readonly id: string;
  readonly organizationId: string;
  readonly product: string;
  readonly key: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly authType: string;
  readonly environment: string | null;
  readonly oauthTokenUrl: string | null;
  readonly secretsCiphertext: string;
  readonly client: string | null;
  readonly writeEnabled: boolean;
  readonly apiPath: string | null;
  readonly timeoutMs: number | null;
  readonly transport: string;
  /**
   * The row's settings revision (P0.2): carried onto the opened connection
   * (ResolvedSapConnection.revision) as the Prisma read carries it, so a
   * connection opened from this load is the same object either way.
   */
  readonly revision: number;
  readonly createdAt: Date;
}

/**
 * The interface's query policy as a query-surface call reads it (P1.4): the
 * compiled form, unparsed (odata/policy.ts parseCompiledPolicy checks it),
 * and whether a builder's source exists at all, which tells a policy a
 * contract change cleared (verify the service) from one never written.
 */
export interface QueryPolicyLoad {
  readonly compiled: unknown;
  readonly sourcePresent: boolean;
}

export interface AccessLoad {
  readonly iface: InterfaceAccessRow | null;
  /** Null unless asked for (`withQueryPolicy`), and without an interface. */
  readonly queryPolicy: QueryPolicyLoad | null;
  /** The grants that may authorise this interface: grantsForInterfaceWhere, in SQL. Empty without an interface. */
  readonly grants: readonly GrantAccessRow[];
  /**
   * The organization's ACTIVE connections for the interface's product, oldest
   * first (resolveSapConnections' query), or null when not asked for.
   */
  readonly connections: readonly StoredConnectionRow[] | null;
}

/**
 * The Prisma queries the access load replaces. The grant query's tuple
 * is `grantsForInterfaceWhere(iface)` (grant-binding.ts).
 */
export const ACCESS_LOAD_REFERENCE = [
  "interface.findFirst({ where: { id: interfaceId, organizationId } })",
  "apiAccessGrant.findMany({ where: { organizationId, solutionId, environment, ...grantsForInterfaceWhere(iface) } })",
  "sapConnection.findMany({ where: { organizationId, product: iface.sapProduct, isActive: true }, orderBy: { createdAt: 'asc' } })",
] as const;

interface AccessSqlRow {
  /** The interface's columns, and `queryPolicyLoad` (null unless asked for), which loadInterfaceAccess takes off it. */
  readonly iface: Record<string, unknown> | null;
  readonly grants: Record<string, unknown>[] | null;
  readonly connections: Record<string, unknown>[] | null;
}

/**
 * json_build_object hands back JSON: every column arrives as written, except
 * that a `timestamp(3)` arrives as text. Only those are converted; nothing
 * else is coerced, so a value reads exactly as Prisma would have returned it.
 */
function withTimestamps<T>(raw: Record<string, unknown>, columns: readonly string[]): T {
  const row: Record<string, unknown> = { ...raw };
  for (const column of columns) {
    if (column in row) row[column] = utcTimestamp(row[column]);
  }
  return row as T;
}

const interfaceRow = (raw: Record<string, unknown>) =>
  withTimestamps<InterfaceAccessRow>(raw, ["serviceVerifiedAt", "createdAt", "grantMatchChangedAt"]);

const grantRow = (raw: Record<string, unknown>) =>
  withTimestamps<GrantAccessRow>(raw, ["expiresAt", "revokedAt", "unboundLastUsedAt", "createdAt", "unboundCutoffAt"]);

const connectionRow = (raw: Record<string, unknown>) => withTimestamps<StoredConnectionRow>(raw, ["createdAt"]);

/**
 * The interface a call names, the grants that may authorise it and (with
 * `withConnections`) the connections that may serve it, in ONE statement.
 *
 * Every table is filtered by `organizationId`: the interface by the caller's,
 * the grants by the caller's and the credential's solution and environment,
 * the connections by the caller's. Nothing is read when the interface is not
 * the caller's organisation's: the grants and connections join to it.
 *
 * `withQueryPolicy` (P1.4): a query-surface read also takes the interface's
 * compiled query policy (at most 64 KiB) in the same statement, so a query
 * page costs no statement more than a legacy read (db-budget.ts). Every other
 * call selects it as NULL: the statement's shape is the same, and the policy
 * never rides on a legacy read or a write. The source and the basis are
 * never read here.
 */
export async function loadInterfaceAccess(
  organizationId: string,
  solutionId: string,
  interfaceId: string,
  environment: string,
  options: { readonly withConnections?: boolean; readonly withQueryPolicy?: boolean } = {},
): Promise<AccessLoad> {
  const withConnections = options.withConnections === true;
  const withQueryPolicy = options.withQueryPolicy === true;
  const rows = await prisma.$queryRaw<AccessSqlRow[]>`/* governed:access-load */
    WITH i AS (
      SELECT CASE WHEN ${withQueryPolicy}::boolean
                  THEN json_build_object('compiled', "queryPolicyCompiled", 'sourcePresent', "queryPolicy" IS NOT NULL)
             END AS "queryPolicyLoad",
             "id", "name", "externalId", "sapProduct", "entitySet", "operation", "mode", "version", "status",
             "solutionId", "servicePath", "odataVersion", "serviceVerifiedAt", "serviceVerifications",
             "createdAt", "grantMatchChangedAt"
      FROM "Interface"
      WHERE "id" = ${interfaceId} AND "organizationId" = ${organizationId}
    )
    SELECT
      (SELECT row_to_json(i) FROM i) AS "iface",
      (SELECT json_agg(json_build_object(
                'id', g."id", 'decision', g."decision"::text, 'expiresAt', g."expiresAt",
                'operation', g."operation", 'revokedAt', g."revokedAt", 'interfaceId', g."interfaceId",
                'sapProduct', g."sapProduct", 'unboundLastUsedAt', g."unboundLastUsedAt",
                'createdAt', g."createdAt", 'unboundCutoffAt', g."unboundCutoffAt") ORDER BY g."createdAt", g."id")
         FROM "ApiAccessGrant" g, i
        WHERE g."organizationId" = ${organizationId}
          AND g."solutionId" = ${solutionId}
          AND g."environment" = ${environment}
          AND g."externalId" = i."externalId"
          AND g."operation" = i."operation"
          AND ((g."interfaceId" = i."id" AND g."sapProduct" = i."sapProduct") OR g."interfaceId" IS NULL)
      ) AS "grants",
      (SELECT json_agg(json_build_object(
                'id', c."id", 'organizationId', c."organizationId", 'product', c."product", 'key', c."key",
                'label', c."label", 'baseUrl', c."baseUrl", 'authType', c."authType",
                'environment', c."environment"::text, 'oauthTokenUrl', c."oauthTokenUrl",
                'secretsCiphertext', c."secretsCiphertext", 'client', c."client", 'writeEnabled', c."writeEnabled",
                'apiPath', c."apiPath", 'timeoutMs', c."timeoutMs", 'transport', c."transport"::text, 'revision', c."revision",
                'createdAt', c."createdAt") ORDER BY c."createdAt", c."id")
         FROM "SapConnection" c, i
        WHERE ${withConnections}::boolean
          AND c."organizationId" = ${organizationId}
          AND c."product" = i."sapProduct"
          AND c."isActive" = true
      ) AS "connections"`;
  const found = rows[0];
  // The policy is taken off the row, so the interface's columns are exactly
  // what they were before P1.4, asked for it or not.
  const { queryPolicyLoad, ...ifaceColumns } = found?.iface ?? {};
  const iface = found?.iface ? interfaceRow(ifaceColumns) : null;
  const policy = queryPolicyLoad as { compiled?: unknown; sourcePresent?: unknown } | null | undefined;
  return {
    iface,
    queryPolicy:
      withQueryPolicy && iface && policy ? { compiled: policy.compiled ?? null, sourcePresent: policy.sourcePresent === true } : null,
    grants: iface ? (found?.grants ?? []).map(grantRow) : [],
    connections: withConnections ? (iface ? (found?.connections ?? []).map(connectionRow) : []) : null,
  };
}

/* ── a console read's connection, and its environment ceiling's grants ── */

/** The grant columns the console's environment ceiling judges (console-read-guard.ts decideConsoleRead). */
export interface CeilingGrantRow {
  readonly decision: string;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  /** Null for a legacy unbound grant: strict grant binding does not honour it (review round 3). */
  readonly interfaceId: string | null;
  /** The owning app's status, or null when it is gone: a RETIRED app's grant authorises nothing (review round 3). */
  readonly solutionStatus: string | null;
}

export interface ConsoleConnectionLoad {
  /** The organization's ACTIVE connection under this product and key, or null. */
  readonly connection: StoredConnectionRow | null;
  /**
   * Every grant of the organization for the connection's declared
   * environment (none when it declares none): what the ceiling asks "is this
   * organization cleared for this landscape at all?" of. Read in the same
   * statement, never cached (P0.14b review round 5).
   */
  readonly grants: readonly CeilingGrantRow[];
}

/**
 * The Prisma queries the console connection load replaces: the named row
 * (connection-resolver.ts resolveSapConnection), then the environment
 * ceiling's grant lookup (console-read-guard.ts decideConsoleRead).
 */
export const CONSOLE_CONNECTION_REFERENCE = [
  "sapConnection.findMany({ where: { organizationId, product, key, isActive: true }, orderBy: { createdAt: 'asc' } })",
  "apiAccessGrant.findMany({ where: { organizationId, environment: connection.environment }, select: { decision, expiresAt, revokedAt, interfaceId, solutionId } })",
  "solution.findFirst({ where: { id: grant.solutionId, organizationId }, select: { status } }) per grant",
] as const;

interface ConsoleConnectionSqlRow {
  readonly connection: Record<string, unknown> | null;
  readonly grants: Record<string, unknown>[] | null;
}

const ceilingGrantRow = (raw: Record<string, unknown>) => withTimestamps<CeilingGrantRow>(raw, ["expiresAt", "revokedAt"]);

/**
 * A Workbench console read's stored connection AND the grants its
 * environment ceiling judges, in ONE statement (P0.14b review round 5).
 *
 * WHY. A console read of a TEST, PROD or undeclared connection sent the
 * connection lookup and, a step later, the ceiling's grant lookup: five
 * statements against P0.19's four. Both are keyed by the organization, and
 * the grants by the connection's own environment, so they are one statement.
 * The grants are read fresh with every call — an authorisation a cache would
 * let outlive a revoked grant — and judged, unchanged, by decideConsoleRead.
 *
 * Both tables are filtered by the caller's organizationId, bound as a
 * parameter (tests/unit/governed/call-loads-sql.test.ts), since the tenant
 * guard does not see a raw statement; the grants are read only beside the
 * caller's own connection.
 */
export async function loadConsoleConnection(organizationId: string, product: string, key: string): Promise<ConsoleConnectionLoad> {
  const rows = await prisma.$queryRaw<ConsoleConnectionSqlRow[]>`/* governed:console-connection */
    WITH c AS (
      SELECT "id", "organizationId", "product", "key", "label", "baseUrl", "authType", "environment",
             "oauthTokenUrl", "secretsCiphertext", "client", "writeEnabled", "apiPath", "timeoutMs",
             "transport", "revision", "createdAt"
      FROM "SapConnection"
      WHERE "organizationId" = ${organizationId} AND "product" = ${product} AND "key" = ${key} AND "isActive" = true
      ORDER BY "createdAt", "id"
      LIMIT 1
    )
    SELECT
      (SELECT json_build_object(
                'id', c."id", 'organizationId', c."organizationId", 'product', c."product", 'key', c."key",
                'label', c."label", 'baseUrl', c."baseUrl", 'authType', c."authType",
                'environment', c."environment"::text, 'oauthTokenUrl', c."oauthTokenUrl",
                'secretsCiphertext', c."secretsCiphertext", 'client', c."client", 'writeEnabled', c."writeEnabled",
                'apiPath', c."apiPath", 'timeoutMs', c."timeoutMs", 'transport', c."transport"::text, 'revision', c."revision",
                'createdAt', c."createdAt")
         FROM c) AS "connection",
      (SELECT json_agg(json_build_object(
                'decision', g."decision"::text, 'expiresAt', g."expiresAt", 'revokedAt', g."revokedAt",
                'interfaceId', g."interfaceId",
                'solutionStatus', (SELECT s."status"::text FROM "Solution" s
                                    WHERE s."id" = g."solutionId" AND s."organizationId" = g."organizationId"))
                ORDER BY g."createdAt", g."id")
         FROM "ApiAccessGrant" g, c
        WHERE g."organizationId" = ${organizationId}
          AND g."environment" = c."environment"::text
      ) AS "grants"`;
  const found = rows[0];
  const connection = found?.connection ? connectionRow(found.connection) : null;
  return { connection, grants: connection ? (found?.grants ?? []).map(ceilingGrantRow) : [] };
}
