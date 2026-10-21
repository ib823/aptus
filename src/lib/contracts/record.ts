/**
 * After a successful verify: turn the compiled description into the
 * interface's recorded contract (P1.3).
 *
 *   1. Slice the IR to the interface's dataset.
 *   2. Record a ContractSnapshot if the contract is new (snapshot.ts).
 *   3. For a write interface, WRITE `requestSchema`'s stamp — which snapshot
 *      and interface version the body its write sends is of — conditional on
 *      that version (a PATCH that landed meanwhile wins, exactly as the
 *      verification itself does). The body is rendered from that snapshot
 *      when /schema is read (renderedRequestSchema), never stored.
 *
 * NEVER FAILS THE VERIFY. The verification is already recorded when this
 * runs. A description the compiler refused, a dataset the slice cannot find,
 * or a database error here are reported in the answer's `contract` field and
 * logged; the verify's own verdict, and the write gate that depends on it,
 * are untouched.
 */

import { Prisma } from "@prisma/client";

import type { CompileResult } from "@/lib/contracts/compile";
import type { Bump } from "@/lib/contracts/diff";
import { contractBodies, type JsonSchema } from "@/lib/contracts/json-schema";
import type { InterfaceContract, ODataVersion } from "@/lib/contracts/ir";
import { contractFromSample } from "@/lib/contracts/sampled";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import {
  currentContractSnapshot,
  currentSnapshotSummaries,
  MAX_CONTRACT_BYTES,
  recordContractSnapshot,
  snapshotContracts,
} from "@/lib/contracts/snapshot";
import type { CapturedSchema } from "@/lib/studio/schema-capture";
import { prisma } from "@/lib/db/prisma";
import { resolveInterfaceService, type InterfaceServiceFields } from "@/lib/sap-public/interface-service";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import type { TenantScope } from "@/lib/studio/tenant-scope";

export type ContractOutcome =
  | {
      status: "RECORDED" | "UNCHANGED";
      snapshotId: string;
      semver: string;
      /** The bump against the previous snapshot; "initial" for the first. */
      bump: Bump | "initial" | null;
      /** Up to ten changes, as plain sentences. */
      changes: string[];
      requestSchemaWritten: boolean;
    }
  | {
      status: "NOT_COMPILED" | "NO_DATASET" | "NOT_RECORDED";
      detail: string;
    };

/** The stamp a written requestSchema carries, read back by the /schema route. */
export interface RequestSchemaStamp {
  snapshotId: string;
  semver: string;
  contentHash: string;
  interfaceVersion: number;
  entitySet: string;
  operation: string;
}

export async function recordVerifiedContract(input: {
  scope: TenantScope;
  iface: { id: string; version: number; externalId: string; entitySet: string | null; operation: string; mode: string };
  compiled: CompileResult | undefined;
  environment: string;
  connectionId: string;
  actorId: string;
}): Promise<ContractOutcome> {
  const { iface, compiled } = input;
  if (!compiled) return { status: "NOT_COMPILED", detail: "The service's description was not read in full." };
  if (!compiled.ok) {
    return { status: "NOT_COMPILED", detail: `The service's description could not be compiled: ${compiled.detail}` };
  }
  if (!iface.entitySet) {
    return { status: "NO_DATASET", detail: "The interface names no dataset, so there is no contract to record yet." };
  }
  // In proportion to the description as well as absolutely (slice.ts).
  const slice = sliceForEntitySet(compiled.ir, iface.entitySet, compiled.sourceLength);
  if (!slice.ok) {
    return slice.reason === "TOO_LARGE"
      ? { status: "NOT_COMPILED", detail: `The service's description could not be compiled: ${slice.detail}` }
      : { status: "NO_DATASET", detail: slice.detail };
  }

  try {
    const outcome = await recordContractSnapshot({
      scope: input.scope,
      iface: { id: iface.id, version: iface.version, externalId: iface.externalId, entitySet: iface.entitySet },
      contract: slice.contract,
      environment: input.environment,
      connectionId: input.connectionId,
      createdById: input.actorId,
    });
    if (outcome.status === "TOO_LARGE") {
      return {
        status: "NOT_COMPILED",
        detail: `The compiled contract is larger than ${MAX_CONTRACT_BYTES / (1024 * 1024)} MB, so it was not recorded.`,
      };
    }

    let requestSchemaWritten = false;
    if (iface.mode === "WRITE") {
      /*
       * THE BODY OF THE CURRENT CONTRACT, NOT OF THIS VERIFY'S. An environment
       * behind the others (PROD, after DEV recorded 2.0.0) verifies UNCHANGED
       * against its own older row; writing that row's body put 1.0.0's closed
       * create body beside the 2.0.0 contract /schema serves as current, one
       * refusing what the other requires (hostile-input review round 1). So
       * the stamp written names the current snapshot, and /schema serves its
       * body only while that snapshot is still current.
       */
      const current = (await currentSnapshotSummaries(input.scope, [iface])).get(iface.id);
      let described: { snapshot: { id: string; semver: string; contentHash: string }; contract: InterfaceContract } | null =
        current && current.id !== outcome.snapshot.id ? null : { snapshot: outcome.snapshot, contract: slice.contract };
      if (current && !described) {
        const read = (await snapshotContracts(input.scope, new Map([[iface.id, current]]))).get(iface.id);
        if (read && read.source === "METADATA") described = { snapshot: read, contract: read.contract };
      }
      // Whether the contract HAS the body this interface's write sends; the
      // body itself is never stored (below), so nothing is rendered here.
      const bodies = described ? contractBodies(described.contract) : null;
      const hasBody = bodies !== null && (iface.operation === "UPDATE" ? bodies.update : bodies.create);
      if (hasBody && described) {
        const stamp: RequestSchemaStamp = {
          snapshotId: described.snapshot.id,
          semver: described.snapshot.semver,
          contentHash: described.snapshot.contentHash,
          interfaceVersion: iface.version,
          entitySet: iface.entitySet,
          operation: iface.operation,
        };
        /*
         * THE STAMP, NOT THE BODY. The body is a pure function of the stamped
         * snapshot (standaloneSchemas), and a multiple of it: 52 MB for a
         * contract under the size bound, written to the Interface row and
         * read back by every Studio list of the organisation's interfaces
         * (hostile-input review round 2). So the row keeps what decides
         * WHICH body describes the interface, a few hundred bytes whatever
         * the contract, and /schema renders the body from the snapshot it
         * already reads (renderedRequestSchema).
         */
        const written = await prisma.interface.updateMany({
          where: { id: iface.id, organizationId: input.scope.organizationId, version: iface.version },
          data: { requestSchema: { "x-contract": stamp } as unknown as Prisma.InputJsonObject },
        });
        requestSchemaWritten = written.count > 0;
      }
    }

    return {
      status: outcome.status,
      snapshotId: outcome.snapshot.id,
      semver: outcome.snapshot.semver,
      bump: outcome.status === "RECORDED" ? (outcome.diff?.bump ?? "initial") : null,
      changes: outcome.status === "RECORDED" ? (outcome.diff?.changes ?? []).slice(0, 10).map((c) => c.change) : [],
      requestSchemaWritten,
    };
  } catch (err) {
    console.error("[contracts] snapshot not recorded", {
      interfaceId: iface.id,
      error: err instanceof Error ? err.name : "unknown",
    });
    return { status: "NOT_RECORDED", detail: "The contract was compiled but could not be recorded. Verify again." };
  }
}

/**
 * The ids of the interfaces matching `where` that have a requestSchema, by
 * a query that never reads the column: what a list needs to know.
 */
export async function idsWithRequestSchema(where: Prisma.InterfaceWhereInput): Promise<Set<string>> {
  const rows = await prisma.interface.findMany({
    where: { AND: [where, { requestSchema: { not: Prisma.DbNull } }] },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
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

export type SampledOutcome =
  | { status: "RECORDED" | "UNCHANGED"; snapshotId: string; semver: string }
  | { status: "METADATA_PREFERRED"; snapshotId: string; semver: string }
  | { status: "NOT_RECORDED"; detail: string };

/**
 * Which OData version sampled rows came from: what the interface or the
 * service it reads declares (serviceODataVersion), or what the rows' own
 * envelope says (V2 carries `__metadata`, V4 `@odata.*` keys) — though rows
 * the broker served have had that envelope stripped. Null when nothing tells
 * — nothing is guessed.
 */
export function sampledODataVersion(
  declared: string | null,
  rows: readonly Record<string, unknown>[],
): ODataVersion | null {
  if (declared === "V2" || declared === "V4") return declared;
  if (rows.some((r) => "__metadata" in r)) return "V2";
  if (rows.some((r) => Object.keys(r).some((k) => k.startsWith("@odata.")))) return "V4";
  return null;
}

/**
 * The OData version of the service an interface reads, from the same resolver
 * the broker's read used (interface-service.ts): its declared protocol, or —
 * where a curated definition states none — SAP's path convention (V4 services
 * are served under /sap/opu/odata4/; an unstated protocol is V2, as the
 * definition's own contract says). Null when the service does not resolve;
 * never throws, because a capture must not fail over a contract.
 */
export async function serviceODataVersion(iface: InterfaceServiceFields): Promise<ODataVersion | null> {
  try {
    const product = getSapProduct(iface.sapProduct);
    if (!product) return null;
    const resolved = await resolveInterfaceService(product, iface);
    if (!resolved) return null;
    const { protocol, path } = resolved.service;
    if (protocol === "ODATAV4") return "V4";
    if (protocol === "ODATAV2") return "V2";
    return /\/odata4\//i.test(path) ? "V4" : "V2";
  } catch (err) {
    console.error("[contracts] service version not resolved", { error: err instanceof Error ? err.name : "unknown" });
    return null;
  }
}

/**
 * After a schema capture: the sampled-row FALLBACK contract. Recorded only
 * while no snapshot compiled from the service's own description describes the
 * interface — a description beats a sample, and a capture must never push a
 * compiled contract aside. Never fails the capture.
 */
export async function recordSampledContract(input: {
  scope: TenantScope;
  iface: { id: string; version: number; externalId: string; entitySet: string | null; odataVersion: string | null };
  schema: Pick<CapturedSchema, "properties">;
  rows: readonly Record<string, unknown>[];
  actorId: string;
}): Promise<SampledOutcome> {
  const { iface } = input;
  if (!iface.entitySet) return { status: "NOT_RECORDED", detail: "The interface names no dataset." };
  const version = sampledODataVersion(iface.odataVersion, input.rows);
  if (!version) {
    return {
      status: "NOT_RECORDED",
      detail: "The OData version of these rows cannot be established, so no contract was recorded from them.",
    };
  }
  try {
    const current = await currentContractSnapshot(input.scope, iface);
    if (current?.source === "METADATA") {
      return { status: "METADATA_PREFERRED", snapshotId: current.id, semver: current.semver };
    }
    const outcome = await recordContractSnapshot({
      scope: input.scope,
      iface: { id: iface.id, version: iface.version, externalId: iface.externalId, entitySet: iface.entitySet },
      contract: contractFromSample(input.schema, iface.entitySet, version),
      createdById: input.actorId,
    });
    if (outcome.status === "TOO_LARGE") {
      return { status: "NOT_RECORDED", detail: "The sampled contract is too large to record." };
    }
    return { status: outcome.status, snapshotId: outcome.snapshot.id, semver: outcome.snapshot.semver };
  } catch (err) {
    console.error("[contracts] sampled snapshot not recorded", {
      interfaceId: iface.id,
      error: err instanceof Error ? err.name : "unknown",
    });
    return { status: "NOT_RECORDED", detail: "The sampled contract could not be recorded." };
  }
}
