/**
 * WHAT GET /schema SERVED AT f54c6f5a, as a reference for the differential
 * tests (P1.3). That build rendered the schemas on every read —
 * renderForRead("schema"): jsonText of standaloneSchemas(contract, its type
 * name), and jsonText of the write body with its stamp while the stamp was
 * current (renderedRequestSchema) — and spliced the two texts into
 * `{"schemas":…,"requestSchema":…}`. The route now serves texts rendered
 * once at record time (jobs.ts, renderSchemaTexts) and spliced
 * (request-schema.ts, requestSchemaText); the tests hold the two to the
 * same bytes.
 *
 * (jsonText of a compact, unsorted value is JSON.stringify's own text:
 * tests/unit/contracts/containment.test.ts holds the writer to it.)
 *
 * f54c6f5a RENDERED THE STORED IR: `ir::text` of a jsonb column, whose keys
 * PostgreSQL keeps shorter-first, then bytewise — not the compiler's object.
 * So the reference renders the contract as the database hands it back
 * (asStoredJsonb, an implementation of jsonb's order independent of the
 * code under test; the integration test renders the stored row's own
 * `ir::text`). A reference that rendered the compiler's object shared the
 * code's mistake: /schema's x-personal-data members came out in another order
 * than the kit's and the document's (consolidated review round 1).
 */

import type { InterfaceContract } from "@/lib/contracts/ir";
import { standaloneSchemas, type JsonSchema } from "@/lib/contracts/json-schema";
import { toTypeName } from "@/lib/contracts/names";
import { currentRequestSchemaStamp } from "@/lib/contracts/request-schema";

/** A JSON value as PostgreSQL's jsonb returns it: object keys by UTF-8 length, then bytewise. */
export function asStoredJsonb<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => {
      if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
      const keys = Object.keys(v).sort((a, b) => {
        const [x, y] = [Buffer.from(a, "utf8"), Buffer.from(b, "utf8")];
        return x.length - y.length || Buffer.compare(x, y);
      });
      return Object.fromEntries(keys.map((k) => [k, (v as Record<string, unknown>)[k]]));
    }),
  ) as T;
}

/**
 * The `schemas` and `requestSchema` members of GET /schema's `data`, as f54c6f5a wrote them:
 * from the contract as stored (`storedIrText`, the row's `ir::text`, when there is one).
 */
export function referenceSchemaMembers(
  compiled: InterfaceContract,
  entitySet: string,
  snapshotId: string,
  storedRequestSchema: unknown,
  iface: { version: number; entitySet: string | null },
  storedIrText?: string,
): string {
  const contract = storedIrText === undefined ? asStoredJsonb(compiled) : (JSON.parse(storedIrText) as InterfaceContract);
  const schemas = standaloneSchemas(contract, toTypeName(entitySet));
  const stamp = currentRequestSchemaStamp(storedRequestSchema, iface, snapshotId);
  const body: JsonSchema | null = stamp ? (stamp.operation === "UPDATE" ? schemas.update : schemas.create) : null;
  const requestSchema = stamp && body ? { ...body, "x-contract": stamp } : null;
  return `{"schemas":${JSON.stringify(schemas)},"requestSchema":${JSON.stringify(requestSchema)}}`;
}
