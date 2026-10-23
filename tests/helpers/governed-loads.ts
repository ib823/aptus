/**
 * The governed call's two statements (src/lib/governed/call-loads.ts, P0.19),
 * answered through the Prisma queries they replace.
 *
 * WHY. Unit and property tests stand in for the database with per-model
 * fakes that evaluate the broker's own `where` clauses. Since P0.19 the
 * credential lookup and the access load are one SQL statement each, which a
 * per-model fake cannot read. This answers each statement by asking the fake
 * the REFERENCE queries (CREDENTIAL_LOOKUP_REFERENCE, ACCESS_LOAD_REFERENCE),
 * with the same where shapes the code used to send, so every assertion about
 * those shapes and every fake's evaluation of them still holds.
 * tests/integration/governed-call-loads.test.ts proves on PostgreSQL that
 * the SQL and these reference queries return the same rows.
 *
 * Use: `$queryRaw: governedQueryRaw(() => fakePrisma)` in a `@/lib/db/prisma`
 * mock. Any other raw statement goes to `otherwise`, or throws.
 */

import { grantsForInterfaceWhere } from "@/lib/studio/grant-binding";

type Row = Record<string, unknown>;
type Fn = (args: Row) => Promise<unknown>;

/** The parts of a Prisma fake the reference queries use; absent ones read as "no rows". */
export interface ReferenceFake {
  solutionClient?: { findUnique?: Fn };
  retiredClientToken?: { findUnique?: Fn };
  solution?: { findFirst?: Fn };
  interface?: { findFirst?: Fn };
  apiAccessGrant?: { findMany?: Fn };
  sapConnection?: { findMany?: Fn };
}

const CREDENTIAL_SELECT = {
  id: true,
  organizationId: true,
  solutionId: true,
  environment: true,
  sapClient: true,
  isActive: true,
  revokedAt: true,
  expiresAt: true,
  previousValidUntil: true,
  lastUsedAt: true,
  tokenHash: true,
  overlapForTokenHash: true,
  secretsCiphertext: true,
} as const;

function sqlText(first: unknown): string {
  if (Array.isArray(first)) return first.join("?");
  if (first && typeof first === "object" && "strings" in first) return (first as { strings: string[] }).strings.join("?");
  return String(first);
}

function sqlValues(first: unknown, rest: unknown[]): unknown[] {
  if (first && typeof first === "object" && !Array.isArray(first) && "values" in first) {
    return (first as { values: unknown[] }).values;
  }
  return rest;
}

/** The credential lookup: current key, then previous, then retired; then the solution. */
export async function referenceCredentialLookup(db: ReferenceFake, tokenHash: string, withWriteKey: boolean): Promise<Row[]> {
  let row = (await db.solutionClient?.findUnique?.({ where: { tokenHash }, select: CREDENTIAL_SELECT })) as Row | null | undefined;
  let match = "current";
  if (!row) {
    row = (await db.solutionClient?.findUnique?.({ where: { previousTokenHash: tokenHash }, select: CREDENTIAL_SELECT })) as
      | Row
      | null
      | undefined;
    match = "previous";
  }
  if (!row) {
    const retired = (await db.retiredClientToken?.findUnique?.({
      where: { tokenHash },
      select: { client: { select: CREDENTIAL_SELECT } },
    })) as { client?: Row } | null | undefined;
    row = retired?.client ?? null;
    match = "retired";
  }
  if (!row) return [];
  const solution = (await db.solution?.findFirst?.({
    where: { id: row.solutionId, organizationId: row.organizationId },
    select: { status: true },
  })) as { status?: string } | null | undefined;
  return [
    {
      id: row.id,
      organizationId: row.organizationId,
      solutionId: row.solutionId,
      environment: row.environment,
      sapClient: row.sapClient ?? null,
      isActive: row.isActive,
      revokedAt: row.revokedAt ?? null,
      expiresAt: row.expiresAt ?? null,
      previousValidUntil: row.previousValidUntil ?? null,
      lastUsedAt: row.lastUsedAt ?? null,
      tokenHash: row.tokenHash ?? (match === "current" ? tokenHash : null),
      overlapForTokenHash: row.overlapForTokenHash ?? null,
      match,
      secretsCiphertext: withWriteKey ? (row.secretsCiphertext ?? null) : null,
      solutionStatus: solution?.status ?? null,
    },
  ];
}

/** The access load: the interface, then its grants and (when asked) its connections. */
export async function referenceAccessLoad(
  db: ReferenceFake,
  interfaceId: string,
  organizationId: string,
  solutionId: string,
  environment: string,
  withConnections: boolean,
): Promise<Row[]> {
  const iface = (await db.interface?.findFirst?.({ where: { id: interfaceId, organizationId } })) as Row | null | undefined;
  if (!iface) return [{ iface: null, grants: null, connections: null }];
  const grants = ((await db.apiAccessGrant?.findMany?.({
    where: {
      organizationId,
      solutionId,
      environment,
      ...grantsForInterfaceWhere({
        id: String(iface.id),
        externalId: String(iface.externalId),
        operation: String(iface.operation),
        sapProduct: String(iface.sapProduct),
        createdAt: (iface.createdAt as Date) ?? new Date(0),
        grantMatchChangedAt: (iface.grantMatchChangedAt as Date | null) ?? null,
      }),
    },
  })) ?? []) as Row[];
  const connections = withConnections
    ? (((await db.sapConnection?.findMany?.({
        where: { organizationId, product: iface.sapProduct, isActive: true },
        orderBy: { createdAt: "asc" },
      })) ?? []) as Row[])
    : null;
  // As the SQL answers: json_agg over no rows is NULL.
  return [
    {
      iface,
      grants: grants.length === 0 ? null : grants,
      connections: connections === null || connections.length === 0 ? null : connections,
    },
  ];
}

/**
 * The console connection load (P0.14b review round 5): the named active row,
 * then the organization's grants for its environment, as
 * resolveSapConnection and decideConsoleRead asked them.
 */
export async function referenceConsoleConnection(db: ReferenceFake, organizationId: string, product: string, key: string): Promise<Row[]> {
  const rows = ((await db.sapConnection?.findMany?.({
    where: { organizationId, product, key, isActive: true },
    orderBy: { createdAt: "asc" },
  })) ?? []) as Row[];
  const connection = rows.find((r) => r.key === key) ?? null;
  if (!connection) return [{ connection: null, grants: null }];
  const environment = connection.environment ?? null;
  const grants =
    environment === null
      ? []
      : await Promise.all(
          (((await db.apiAccessGrant?.findMany?.({
            where: { organizationId, environment },
            select: { decision: true, expiresAt: true, revokedAt: true, interfaceId: true, solutionId: true },
          })) ?? []) as Row[]).map(async ({ solutionId, ...g }) => {
            // The owning app's status, in this organization (wave 2
            // integration review round 3). A fake with no solution table
            // carries none: absent, not null.
            if (!db.solution?.findFirst) return g;
            const solution = (await db.solution.findFirst({
              where: { id: solutionId, organizationId },
              select: { status: true },
            })) as Row | null;
            return { ...g, solutionStatus: solution?.status ?? null };
          }),
        );
  return [{ connection, grants: grants.length === 0 ? null : grants }];
}

/**
 * A `$queryRaw` for a Prisma fake: the governed statements through the
 * reference queries, anything else to `otherwise`.
 */
export function governedQueryRaw(
  /** The fake; any object with the ReferenceFake methods it has (typed loosely so every test's fake fits). */
  fake: () => unknown,
  otherwise?: (first: unknown, ...rest: unknown[]) => Promise<unknown>,
): (first: unknown, ...rest: unknown[]) => Promise<unknown> {
  const db = () => fake() as ReferenceFake;
  return async (first: unknown, ...rest: unknown[]) => {
    const text = sqlText(first);
    const values = sqlValues(first, rest);
    if (text.includes("governed:credential-lookup")) {
      // ${withWriteKey}, then the hash three times.
      return referenceCredentialLookup(db(), String(values[1]), values[0] === true);
    }
    if (text.includes("governed:access-load")) {
      // interfaceId, organizationId, organizationId, solutionId, environment, withConnections, organizationId
      return referenceAccessLoad(db(), String(values[0]), String(values[1]), String(values[3]), String(values[4]), values[5] === true);
    }
    if (text.includes("governed:console-connection")) {
      // organizationId, product, key, organizationId
      return referenceConsoleConnection(db(), String(values[0]), String(values[1]), String(values[2]));
    }
    if (otherwise) return otherwise(first, ...rest);
    throw new Error(`governedQueryRaw: unexpected raw statement: ${text.slice(0, 120)}`);
  };
}
