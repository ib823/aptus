/**
 * The stamp a write interface's stored requestSchema carries, and the write
 * body /schema serves from it (P1.3). Pure — no database, no I/O.
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
 * The write body /schema serves as `requestSchema`, spliced from the text the
 * record stored (the current snapshot's create or, for an UPDATE interface,
 * update body, as compact JSON): the body with the stamp as its last member —
 * exactly what JSON.stringify({ ...body, "x-contract": stamp }) writes, without
 * parsing the body back. Null when there is no body.
 */
export function requestSchemaText(bodyText: string | null, stamp: RequestSchemaStamp): string | null {
  if (bodyText === null) return null;
  return `${bodyText.slice(0, -1)}${bodyText === "{}" ? "" : ","}"x-contract":${JSON.stringify(stamp)}}`;
}
