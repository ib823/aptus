/**
 * Where an interface's query policy is stored, and the one writer of its
 * compiled form (P1.4, 3.5.1 and 3.5.7).
 *
 *   queryPolicy          the builder's source (Studio's save and delete)
 *   queryBasis           what the current contract lets a query do (a verify)
 *   queryPolicyCompiled  the source compiled against the basis: the only one
 *                        a governed call reads
 *   queryPolicyRevision  +1 on every save, recompile and delete
 *
 * ONE ROW LOCK ORDERS EVERY WRITER. A verify that rewrites the basis and a
 * Studio save that compiles against it both take the interface's row FOR
 * UPDATE first (lockQueryPolicyRow), so whichever runs second reads what the
 * first wrote, and the compiled policy is always compiled against the basis
 * stored beside it. The PATCH that changes the contract nulls both in the
 * same update that bumps the version, which takes the same row lock.
 *
 * THE BOUND IS HELD HERE, AT THE ONE WRITER (and again by the one reader,
 * policy.ts parseCompiledPolicy): a compiled policy over 64 KiB is never
 * written, because it rides in a governed call's access-load statement.
 * There is no CHECK constraint; the column is JSONB.
 */

import { Prisma } from "@prisma/client";

import type { QueryBasisV1 } from "@/lib/odata/basis";
import { QueryCompilerInvariantError } from "@/lib/odata/identifiers";
import { QUERY_POLICY_COMPILED_MAX_BYTES, type CompiledQueryPolicyV1, type QueryPolicySourceV1 } from "@/lib/odata/policy";

/** The query-policy columns of a locked interface row, as stored. */
export interface QueryPolicyRow {
  readonly queryPolicy: unknown;
  readonly queryBasis: unknown;
  readonly queryPolicyCompiled: unknown;
  readonly queryPolicyRevision: number;
  readonly entitySet: string | null;
  readonly odataVersion: string | null;
  readonly version: number;
}

/**
 * The interface's query-policy columns, its row locked until the transaction
 * ends. Scoped to the organisation (a raw statement passes the tenant guard
 * by, so the scope is written here). With `version`, only while the
 * interface is still at it: a PATCH that bumped it meanwhile wins, and the
 * caller writes nothing.
 */
export async function lockQueryPolicyRow(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  organizationId: string,
  interfaceId: string,
  version?: number,
): Promise<QueryPolicyRow | null> {
  const versionClause = version === undefined ? Prisma.empty : Prisma.sql` AND "version" = ${version}`;
  const rows = await tx.$queryRaw<QueryPolicyRow[]>(Prisma.sql`
    SELECT "queryPolicy", "queryBasis", "queryPolicyCompiled", "queryPolicyRevision", "entitySet", "odataVersion", "version"
    FROM "Interface"
    WHERE "id" = ${interfaceId} AND "organizationId" = ${organizationId}${versionClause}
    FOR UPDATE`);
  return rows[0] ?? null;
}

const json = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);

/**
 * Write the compiled policy, and with it the source and the basis when they
 * changed, at `revision`. Call it only on a row lockQueryPolicyRow locked in
 * the same transaction. `undefined` leaves a column as it is; `null` clears it.
 */
export async function writeCompiledQueryPolicy(
  tx: Pick<Prisma.TransactionClient, "interface">,
  organizationId: string,
  interfaceId: string,
  write: {
    readonly revision: number;
    readonly compiled: CompiledQueryPolicyV1 | null;
    readonly source?: QueryPolicySourceV1 | null;
    readonly basis?: QueryBasisV1 | null;
  },
): Promise<void> {
  if (write.compiled !== null && Buffer.byteLength(JSON.stringify(write.compiled), "utf8") > QUERY_POLICY_COMPILED_MAX_BYTES) {
    throw new QueryCompilerInvariantError("A compiled query policy over its bound reached the writer.");
  }
  const data: Prisma.InterfaceUpdateManyMutationInput = {
    queryPolicyCompiled: json(write.compiled),
    queryPolicyRevision: write.revision,
  };
  if (write.source !== undefined) data.queryPolicy = json(write.source);
  if (write.basis !== undefined) data.queryBasis = json(write.basis);
  const written = await tx.interface.updateMany({ where: { id: interfaceId, organizationId }, data });
  if (written.count !== 1) throw new QueryCompilerInvariantError("The locked interface row was not written.");
}

/** Write only the basis: a verify of an interface with no policy, whose revision does not move. */
export async function writeQueryBasis(
  tx: Pick<Prisma.TransactionClient, "interface">,
  organizationId: string,
  interfaceId: string,
  basis: QueryBasisV1,
): Promise<void> {
  await tx.interface.updateMany({ where: { id: interfaceId, organizationId }, data: { queryBasis: basis as unknown as Prisma.InputJsonValue } });
}
