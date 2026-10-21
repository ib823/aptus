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
 */

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { artifactState, type ContractIdentity, type SchemaState } from "@/lib/studio/contract-provenance";

interface StampRow {
  id: string;
  captured: boolean | null;
  stampVersion: number | null;
  stampEntitySet: string | null;
}

/** The stamp facts of every interface of the organisation (optionally one solution) that has a stored response schema. */
async function stampFacts(organizationId: string, solutionId?: string | null): Promise<Map<string, StampRow>> {
  const rows = await prisma.$queryRaw<StampRow[]>(Prisma.sql`
    SELECT "id",
      (("responseSchema"->>'type') = 'object'
        AND jsonb_typeof("responseSchema"->'properties') IN ('object', 'array')) AS "captured",
      CASE WHEN jsonb_typeof("responseSchema"->'x-captured'->'interfaceVersion') = 'number'
        THEN ("responseSchema"->'x-captured'->>'interfaceVersion')::float8 END AS "stampVersion",
      CASE WHEN jsonb_typeof("responseSchema"->'x-captured'->'entitySet') = 'string'
        THEN "responseSchema"->'x-captured'->>'entitySet' END AS "stampEntitySet"
    FROM "Interface"
    WHERE "organizationId" = ${organizationId}
      ${solutionId ? Prisma.sql`AND "solutionId" = ${solutionId}` : Prisma.empty}
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
  const facts = interfaces.length === 0 ? new Map<string, StampRow>() : await stampFacts(organizationId, solutionId);
  const out = new Map<string, SchemaState>();
  for (const i of interfaces) {
    const f = facts.get(i.id);
    if (!f) out.set(i.id, "none");
    else if (f.captured !== true) out.set(i.id, "unverified");
    else out.set(i.id, artifactState({ interfaceVersion: f.stampVersion, entitySet: f.stampEntitySet }, i));
  }
  return out;
}
