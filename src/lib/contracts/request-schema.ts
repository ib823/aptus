/**
 * The stamp a write interface's stored requestSchema carries, and the write
 * body /schema serves from it (P1.3). Pure — no database, no I/O — so the
 * request thread (record.ts re-exports it) and the envelope's worker, which
 * renders a large /schema (pipeline.ts, read-render.ts), decide it the same
 * way.
 */

import type { JsonSchema } from "@/lib/contracts/json-schema";

/** The stamp a written requestSchema carries, read back by the /schema route. */
export interface RequestSchemaStamp {
  snapshotId: string;
  semver: string;
  contentHash: string;
  interfaceVersion: number;
  entitySet: string;
  operation: string;
}

/** The stamp a stored requestSchema carries, or null when it carries none. */
export function requestSchemaStamp(schema: unknown): RequestSchemaStamp | null {
  if (!schema || typeof schema !== "object") return null;
  const stamp = (schema as JsonSchema)["x-contract"];
  if (!stamp || typeof stamp !== "object") return null;
  const s = stamp as Partial<RequestSchemaStamp>;
  return typeof s.interfaceVersion === "number" && typeof s.entitySet === "string" && typeof s.snapshotId === "string"
    ? (s as RequestSchemaStamp)
    : null;
}

/**
 * The stored stamp when it describes the interface's current contract, else
 * null: written for this interface version and dataset, from the snapshot
 * that is current now (`currentSnapshotId`). A body of an older snapshot is
 * never served beside a newer contract.
 */
export function currentRequestSchemaStamp(
  schema: unknown,
  iface: { version: number; entitySet: string | null },
  currentSnapshotId: string | null,
): RequestSchemaStamp | null {
  const stamp = requestSchemaStamp(schema);
  return stamp &&
    currentSnapshotId !== null &&
    stamp.snapshotId === currentSnapshotId &&
    stamp.interfaceVersion === iface.version &&
    stamp.entitySet === iface.entitySet
    ? stamp
    : null;
}

/**
 * The write body /schema serves as `requestSchema`: the current snapshot's
 * create (or, for an UPDATE interface, update) schema, rendered from that
 * snapshot (`schemas`, standaloneSchemas of it) and carrying the stamp —
 * exactly what was stored before only the stamp was. Null when the stamp
 * does not describe the current contract, or that contract has no such body.
 */
export function renderedRequestSchema(
  stored: unknown,
  iface: { version: number; entitySet: string | null },
  current: { id: string; schemas: { create: JsonSchema | null; update: JsonSchema | null } } | null,
): JsonSchema | null {
  const stamp = currentRequestSchemaStamp(stored, iface, current?.id ?? null);
  if (!stamp || !current) return null;
  const body = stamp.operation === "UPDATE" ? current.schemas.update : current.schemas.create;
  return body ? { ...body, "x-contract": stamp } : null;
}
