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
 */

import type { InterfaceContract } from "@/lib/contracts/ir";
import { standaloneSchemas, type JsonSchema } from "@/lib/contracts/json-schema";
import { toTypeName } from "@/lib/contracts/names";
import { currentRequestSchemaStamp } from "@/lib/contracts/request-schema";

/** The `schemas` and `requestSchema` members of GET /schema's `data`, as f54c6f5a wrote them. */
export function referenceSchemaMembers(
  contract: InterfaceContract,
  entitySet: string,
  snapshotId: string,
  storedRequestSchema: unknown,
  iface: { version: number; entitySet: string | null },
): string {
  const schemas = standaloneSchemas(contract, toTypeName(entitySet));
  const stamp = currentRequestSchemaStamp(storedRequestSchema, iface, snapshotId);
  const body: JsonSchema | null = stamp ? (stamp.operation === "UPDATE" ? schemas.update : schemas.create) : null;
  const requestSchema = stamp && body ? { ...body, "x-contract": stamp } : null;
  return `{"schemas":${JSON.stringify(schemas)},"requestSchema":${JSON.stringify(requestSchema)}}`;
}
