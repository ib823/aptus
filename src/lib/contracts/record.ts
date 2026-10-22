/**
 * After a verify, and after a schema capture: turn what the compiler's job
 * made ready (jobs.ts) into the interface's recorded contract (P1.3).
 *
 *   1. The job compiled the description (or the sampled rows), sliced it to
 *      the interface's dataset, digested it, rendered the /schema texts and
 *      diffed it against the interface's previous heads — inside the
 *      envelope. Nothing about the description is computed on this thread.
 *   2. One transaction records a ContractSnapshot when the contract is new
 *      (snapshot.ts), puts the /schema texts on the interface's current row,
 *      and — for a write interface — WRITES `requestSchemaStamp`: which
 *      snapshot and interface version the body its write sends is of,
 *      conditional on that version (a PATCH that landed meanwhile wins). A
 *      capture writes its schema on the interface in the same transaction.
 *
 * NEVER FAILS THE VERIFY. The verification is already recorded when this
 * runs. A description the compiler refused, a job that did not run, or a
 * database error here are reported in the answer's `contract` field and
 * logged; the verify's own verdict, and the write gate that depends on it,
 * are untouched.
 */

import { Prisma } from "@prisma/client";

import type { Bump } from "@/lib/contracts/diff";
import type { InterfaceContract, ODataVersion } from "@/lib/contracts/ir";
import { textOf, type CaptureJobOutput, type CompiledService, type RecordableContract, type Text } from "@/lib/contracts/jobs";
import type { RequestSchemaStamp } from "@/lib/contracts/request-schema";
import { contractBodies } from "@/lib/contracts/json-schema";
import { recordContractSnapshot, type AlsoWrite } from "@/lib/contracts/snapshot";
import { prisma } from "@/lib/db/prisma";
import { resolveInterfaceService, type InterfaceServiceFields } from "@/lib/sap-public/interface-service";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import type { TenantScope } from "@/lib/studio/tenant-scope";

// Pure, and read on every path that serves a write body.
export { currentRequestSchemaStamp, requestSchemaStamp, type RequestSchemaStamp } from "@/lib/contracts/request-schema";

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
      /** When the compiler refused for a known wait (BUSY: seconds; its daily time: until 00:00 UTC). */
      retryAfterSeconds?: number;
    };

/** The seconds a refused job may be retried after: BUSY in a moment, a spent allowance at 00:00 UTC. */
export function refusalRetryAfterSeconds(compiled: { reason: string; retryAfterMs?: number }): number | undefined {
  if (compiled.reason === "BUSY") return 5;
  if (compiled.retryAfterMs !== undefined) return Math.max(1, Math.ceil(compiled.retryAfterMs / 1000));
  return undefined;
}

/** A compile that was refused (or a job that did not run), as the verify's `contract` says it, with its retry time. */
export function notCompiled(compiled: { reason: string; detail: string; retryAfterMs?: number }): ContractOutcome {
  const retryAfterSeconds = refusalRetryAfterSeconds(compiled);
  return {
    status: "NOT_COMPILED",
    detail: `The service's description could not be compiled: ${compiled.detail}`,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}

export async function recordVerifiedContract(input: {
  scope: TenantScope;
  iface: { id: string; version: number; externalId: string; entitySet: string | null; operation: string; mode: string };
  /** The verify's record job (service-verify.ts), with the interface's dataset made ready to record. */
  compiled: CompiledService | undefined;
  /** The rows the job diffed against (snapshot.ts, loadRecordHeads), by id. */
  heads: { ids: readonly string[]; currentId?: string | null } | undefined;
  environment: string;
  connectionId: string;
  actorId: string;
}): Promise<ContractOutcome> {
  const { iface, compiled } = input;
  if (!compiled) return { status: "NOT_COMPILED", detail: "The service's description was not read in full." };
  if (!compiled.ok) return notCompiled(compiled);
  if (!iface.entitySet) {
    return { status: "NO_DATASET", detail: "The interface names no dataset, so there is no contract to record yet." };
  }
  const prepared = compiled.dataset;
  if (!prepared || !input.heads) return { status: "NOT_COMPILED", detail: "The interface's dataset was not compiled with the description. Verify again." };
  if (!prepared.ok) {
    return prepared.reason === "TOO_LARGE" || prepared.reason === "OUTPUT_TOO_LARGE"
      ? { status: "NOT_COMPILED", detail: `The service's description could not be compiled: ${prepared.detail}` }
      : { status: "NO_DATASET", detail: prepared.detail };
  }

  let requestSchemaWritten = false;
  /*
   * THE BODY OF THE CURRENT CONTRACT, NOT OF THIS VERIFY'S. An environment
   * behind the others (PROD, after DEV recorded 2.0.0) verifies UNCHANGED
   * against its own older row; the stamp written names the snapshot that is
   * current, and /schema serves its body only while it still is. Whether the
   * current contract HAS the body this interface's write sends: this
   * verify's from the facts the job took, another snapshot's from two
   * capabilities read in the database (snapshotBodies) — never its IR.
   */
  const writeStamp: AlsoWrite = async (tx, outcome, current) => {
    if (iface.mode !== "WRITE" || !current || !iface.entitySet) return;
    const bodies =
      current.id === outcome.snapshot.id || current.contentHash === prepared.hash
        ? prepared.facts.bodies
        : current.source === "METADATA"
          ? await snapshotBodies(tx, input.scope, current.id)
          : null;
    if (!bodies || !(iface.operation === "UPDATE" ? bodies.update : bodies.create)) return;
    const stamp: RequestSchemaStamp = {
      snapshotId: current.id,
      semver: current.semver,
      contentHash: current.contentHash,
      interfaceVersion: iface.version,
      entitySet: iface.entitySet,
      operation: iface.operation,
    };
    // THE STAMP, NOT THE BODY: the body is on the snapshot (its texts), a few hundred bytes here whatever the contract.
    // NOT IN requestSchema: a build before P1.3 serves that column raw from
    // /schema, so after an Instant Rollback the bare stamp would be served as
    // a schema that accepts any record (P1 on wave 2 integration review round 1).
    const written = await tx.interface.updateMany({
      where: { id: iface.id, organizationId: input.scope.organizationId, version: iface.version },
      data: { requestSchemaStamp: { "x-contract": stamp } as unknown as Prisma.InputJsonObject },
    });
    requestSchemaWritten = written.count > 0;
  };

  try {
    const outcome = await recordContractSnapshot({
      scope: input.scope,
      iface: { id: iface.id, version: iface.version, externalId: iface.externalId, entitySet: iface.entitySet },
      contract: prepared,
      heads: input.heads,
      environment: input.environment,
      connectionId: input.connectionId,
      createdById: input.actorId,
      alsoWrite: writeStamp,
    });
    if (outcome.status === "REFUSED") return { status: "NOT_RECORDED", detail: outcome.detail };
    return {
      status: outcome.status,
      snapshotId: outcome.snapshot.id,
      semver: outcome.snapshot.semver,
      bump: outcome.status === "RECORDED" ? (outcome.diff?.bump ?? "initial") : null,
      changes: outcome.status === "RECORDED" ? (outcome.diff?.changes ?? []).slice(0, 10) : [],
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
 * Whether a snapshot's contract has a create and an update body
 * (contractBodies), read with JSON operators in the database — never by
 * reading its IR onto this thread. Null when the row is gone.
 */
export async function snapshotBodies(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  scope: TenantScope,
  snapshotId: string,
): Promise<{ create: boolean; update: boolean } | null> {
  const rows = await db.$queryRaw<{ source: string; creatable: string | null; updatable: string | null; singleton: string | null }[]>(Prisma.sql`
    SELECT "source",
      "ir"->'entitySet'->'capabilities'->>'creatable' AS "creatable",
      "ir"->'entitySet'->'capabilities'->>'updatable' AS "updatable",
      "ir"->'entitySet'->>'singleton' AS "singleton"
    FROM "ContractSnapshot"
    WHERE "organizationId" = ${scope.organizationId} AND "id" = ${snapshotId}
  `);
  const row = rows[0];
  if (!row) return null;
  const flag = (v: string | null) => (v === "true" ? true : v === "false" ? false : undefined);
  return contractBodies({
    source: row.source === "SAMPLED" ? "SAMPLED" : "METADATA",
    entitySet: { capabilities: { creatable: flag(row.creatable), updatable: flag(row.updatable) }, singleton: flag(row.singleton) },
  } as unknown as InterfaceContract);
}

/**
 * The ids of the interfaces matching `where` that have a requestSchema, by
 * a query that never reads the column: what a list needs to know.
 */
export async function idsWithRequestSchema(where: Prisma.InterfaceWhereInput): Promise<Set<string>> {
  const rows = await prisma.interface.findMany({
    where: { AND: [where, { requestSchemaStamp: { not: Prisma.DbNull } }] },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

export type SampledOutcome =
  | { status: "RECORDED" | "UNCHANGED"; snapshotId: string; semver: string }
  | { status: "METADATA_PREFERRED"; snapshotId: string; semver: string }
  | { status: "NOT_RECORDED"; detail: string };

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

/** The capture's contract changed while it was being captured: nothing is written. */
export class CaptureConflict extends Error {
  override readonly name = "CaptureConflict";
}

/**
 * After a capture job: the captured schema on the interface — conditional on
 * the contract it was stamped with (a PATCH that changed it since has
 * cleared the schema, and this must not put the old one back) — and, while
 * no snapshot compiled from the service's own description describes the
 * interface (`preferred`), the SAMPLED snapshot made from it with its /schema
 * texts: in ONE transaction, or nothing (CaptureConflict). A sampled contract
 * that cannot be recorded never fails the capture; a database error does.
 */
export async function recordCapture(input: {
  scope: TenantScope;
  iface: { id: string; version: number; externalId: string; entitySet: string | null };
  schema: Text;
  /** The job's sampled contract (null: not wanted). */
  contract: Extract<CaptureJobOutput, { ok: true }>["contract"];
  /** The current compiled snapshot, when one describes the interface: then no sample is recorded. */
  preferred: { snapshotId: string; semver: string } | null;
  heads: { ids: readonly string[]; currentId?: string | null };
  actorId: string;
}): Promise<SampledOutcome> {
  const { scope, iface } = input;
  const writeSchema = async (tx: Prisma.TransactionClient) => {
    const n = await tx.$executeRaw(Prisma.sql`
      UPDATE "Interface" SET "responseSchema" = ${textOf(input.schema)}::jsonb, "updatedAt" = now()
      WHERE "id" = ${iface.id} AND "organizationId" = ${scope.organizationId} AND "version" = ${iface.version}
        AND "entitySet" IS NOT DISTINCT FROM ${iface.entitySet}
    `);
    if (n === 0) throw new CaptureConflict();
  };
  const notRecorded = (detail: string): SampledOutcome => ({ status: "NOT_RECORDED", detail });
  const c = input.contract;
  let skipped: SampledOutcome | null = null;
  if (input.preferred) skipped = { status: "METADATA_PREFERRED", ...input.preferred };
  else if (!iface.entitySet) skipped = notRecorded("The interface names no dataset.");
  else if (c === null) skipped = notRecorded("The sampled contract was not prepared.");
  else if (!c.ok) {
    skipped = notRecorded(
      c.reason === "NO_VERSION"
        ? "The OData version of these rows cannot be established, so no contract was recorded from them."
        : c.reason === "TOO_LARGE" || c.reason === "OUTPUT_TOO_LARGE"
          ? "The sampled contract is too large to record."
          : c.detail,
    );
  }
  if (skipped !== null || c === null || !c.ok || !iface.entitySet) {
    await prisma.$transaction(async (tx) => writeSchema(tx));
    return skipped ?? notRecorded("The sampled contract was not prepared.");
  }
  const outcome = await recordContractSnapshot({
    scope,
    iface: { id: iface.id, version: iface.version, externalId: iface.externalId, entitySet: iface.entitySet },
    contract: c as Extract<RecordableContract, { ok: true }>,
    heads: input.heads,
    createdById: input.actorId,
    alsoWrite: (tx) => writeSchema(tx),
  });
  if (outcome.status === "REFUSED") {
    // The history moved meanwhile: the schema is still captured, without its contract.
    await prisma.$transaction(async (tx) => writeSchema(tx));
    return notRecorded(outcome.detail);
  }
  return { status: outcome.status, snapshotId: outcome.snapshot.id, semver: outcome.snapshot.semver };
}
