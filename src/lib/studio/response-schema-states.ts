/**
 * Where each interface's stored response schema stands against its contract
 * (contract-provenance.ts, responseSchemaState), WITHOUT READING THE SCHEMA.
 *
 * WHY. A Studio list of an organisation's interfaces selected every stored
 * `responseSchema` to compute one word per row ("current", "stale", …). A
 * captured schema is as large as the rows it was captured from — and a
 * compiled contract's schemas are larger still — so a list of small rows
 * read and parsed a body per interface, in proportion to whatever had been
 * stored, on every page view (P1.3, structural containment: every read path
 * does work bounded by what it needs, and a list needs a word). Here the
 * database reads the three facts the word depends on — is it a captured
 * schema, and the version and dataset it is stamped with — out of the JSON
 * itself, and only those cross the wire.
 *
 * The same answer as responseSchemaState, fact for fact: a value that is not
 * a captured schema ({ type: "object", properties: {…} }), or carries no
 * numeric x-captured.interfaceVersion, is "unverified"; a stamp matching the
 * interface's version and dataset is "current"; any other "stale"; no value
 * (SQL NULL or JSON null) "none".
 *
 * AND THE READERS THAT DO NEED THE SCHEMA READ IT ONLY WHEN IT IS BOUNDED
 * (structural hardening round 1). /schema, the starter kit and the solution
 * document serve a captured schema, so they must read it — but a schema
 * stored before capture was bounded (LIMITS.capturedSchema) can be 11.5 MB,
 * parsed and re-serialised on every call. capturedSchemaFacts says, with the
 * stamp, how large each stored value is (the length of Postgres's own text
 * of it, measured in the database), and readCurrentCapturedSchemas reads only
 * those that describe the current contract and are inside the stated bound;
 * any other is named (TOO_LARGE), never read.
 */

import { Prisma } from "@prisma/client";

import { LIMITS } from "@/lib/contracts/budget";
import { prisma } from "@/lib/db/prisma";
import {
  artifactState,
  responseSchemaState,
  type ContractIdentity,
  type SchemaState,
} from "@/lib/studio/contract-provenance";
import { servedResponseSchema } from "@/lib/studio/schema-capture";

interface StampRow {
  id: string;
  captured: boolean | null;
  stampVersion: number | null;
  stampEntitySet: string | null;
  /**
   * octet_length of the stored value's jsonb text — at most twice its compact
   * JSON — when asked for by id (capturedSchemaFacts); a list does not need it.
   */
  bytes: number | null;
}

/**
 * The stamp facts of every interface of the organisation (optionally one
 * solution, or only the listed ids) that has a stored response schema.
 */
async function stampFacts(
  organizationId: string,
  filter: { solutionId?: string | null | undefined; ids?: readonly string[] } = {},
): Promise<Map<string, StampRow>> {
  const { solutionId, ids } = filter;
  if (ids && ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<StampRow[]>(Prisma.sql`
    SELECT "id",
      ${ids ? Prisma.sql`octet_length("responseSchema"::text)` : Prisma.sql`NULL::int`} AS "bytes",
      (("responseSchema"->>'type') = 'object'
        AND jsonb_typeof("responseSchema"->'properties') IN ('object', 'array')) AS "captured",
      CASE WHEN jsonb_typeof("responseSchema"->'x-captured'->'interfaceVersion') = 'number'
        THEN ("responseSchema"->'x-captured'->>'interfaceVersion')::float8 END AS "stampVersion",
      CASE WHEN jsonb_typeof("responseSchema"->'x-captured'->'entitySet') = 'string'
        THEN "responseSchema"->'x-captured'->>'entitySet' END AS "stampEntitySet"
    FROM "Interface"
    WHERE "organizationId" = ${organizationId}
      ${solutionId ? Prisma.sql`AND "solutionId" = ${solutionId}` : Prisma.empty}
      ${ids ? Prisma.sql`AND "id" IN (${Prisma.join(ids)})` : Prisma.empty}
      AND "responseSchema" IS NOT NULL
      AND jsonb_typeof("responseSchema") <> 'null'
  `);
  return new Map(rows.map((r) => [r.id, r]));
}

/** The state of each listed interface's response schema, by id, as responseSchemaState would say it. */
export async function responseSchemaStates(
  organizationId: string,
  interfaces: readonly (ContractIdentity & { id: string })[],
  solutionId?: string | null,
): Promise<Map<string, SchemaState>> {
  const facts = interfaces.length === 0 ? new Map<string, StampRow>() : await stampFacts(organizationId, { solutionId });
  const out = new Map<string, SchemaState>();
  for (const i of interfaces) out.set(i.id, stateOf(facts.get(i.id), i));
  return out;
}

function stateOf(f: StampRow | undefined, i: ContractIdentity): SchemaState {
  if (!f) return "none";
  if (f.captured !== true) return "unverified";
  return artifactState({ interfaceVersion: f.stampVersion, entitySet: f.stampEntitySet }, i);
}

/** Where an interface's stored schema stands, and how large it is stored (null when there is none). */
export interface CapturedSchemaFacts {
  state: SchemaState;
  storedBytes: number | null;
}

/** The facts of each listed interface's stored schema, by id, from the database: the schema itself is not read. */
export async function capturedSchemaFacts(
  organizationId: string,
  interfaces: readonly (ContractIdentity & { id: string })[],
): Promise<Map<string, CapturedSchemaFacts>> {
  const facts = await stampFacts(organizationId, { ids: interfaces.map((i) => i.id) });
  const out = new Map<string, CapturedSchemaFacts>();
  for (const i of interfaces) {
    const f = facts.get(i.id);
    out.set(i.id, { state: stateOf(f, i), storedBytes: f && typeof f.bytes === "number" ? Number(f.bytes) : null });
  }
  return out;
}

/** Whether a stored schema of this size may be read at all (LIMITS.capturedSchema.storedTextBytes). */
export function capturedSchemaReadable(storedBytes: number | null): boolean {
  return storedBytes !== null && storedBytes <= LIMITS.capturedSchema.storedTextBytes;
}

/** The current contract's captured schema, as served — or why it is not read. */
export type CurrentCapturedSchema =
  | { ok: true; schema: unknown; /** As stored, before servedResponseSchema. */ stored: unknown }
  | { ok: false; reason: "TOO_LARGE"; storedBytes: number };

/**
 * The served schema (servedResponseSchema) of each listed interface whose
 * stored schema describes its current contract: read only when its stored
 * size is inside the stated bound, named TOO_LARGE otherwise. Interfaces
 * with no current schema are absent. The stamp is checked again on what was
 * read, so a capture that landed meanwhile for another contract is not served.
 */
export async function readCurrentCapturedSchemas(
  organizationId: string,
  interfaces: readonly (ContractIdentity & { id: string })[],
  facts: ReadonlyMap<string, CapturedSchemaFacts>,
): Promise<Map<string, CurrentCapturedSchema>> {
  const out = new Map<string, CurrentCapturedSchema>();
  const readable: string[] = [];
  for (const i of interfaces) {
    const f = facts.get(i.id);
    if (!f || f.state !== "current") continue;
    if (capturedSchemaReadable(f.storedBytes)) readable.push(i.id);
    else out.set(i.id, { ok: false, reason: "TOO_LARGE", storedBytes: f.storedBytes ?? 0 });
  }
  if (readable.length === 0) return out;
  const rows = await prisma.interface.findMany({
    where: { organizationId, id: { in: readable } },
    select: { id: true, responseSchema: true },
  });
  const byId = new Map(interfaces.map((i) => [i.id, i]));
  for (const r of rows) {
    const iface = byId.get(r.id);
    if (iface && responseSchemaState(r.responseSchema, iface) === "current") {
      out.set(r.id, { ok: true, schema: servedResponseSchema(r.responseSchema), stored: r.responseSchema });
    }
  }
  return out;
}
