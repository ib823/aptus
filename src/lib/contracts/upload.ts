/**
 * Register an interface from an uploaded service description (roadmap P1.2):
 * a DRAFT interface WITH its contract, and no call to any tenant.
 *
 * WHY. Nothing worked until the SAP communication arrangement existed: an
 * interface's contract was compiled only from a verify, which needs a
 * connection that can read the service. A builder who holds the service's
 * $metadata (from ADT, from /IWFND/MAINT_SERVICE, from a colleague) can now
 * register it from the file, code against its contract, and verify against
 * a tenant later. A verify of the same description is then UNCHANGED, because
 * the content hash is the same; a tenant that serves something else records
 * the next version, bumped against the upload.
 *
 * THE DESCRIPTION IS PARSED ONLY IN THE CONTRACT COMPILER'S WORKER
 * (envelope.ts runContractJob, the `record` job of jobs.ts), never on the
 * request thread: DOCTYPE refused, its size, depth and element limits, a
 * capped heap and a deadline, the organisation's share of the one gate and
 * its daily compiler time. The raw text is never stored; its sha256 and
 * length go into the audit row.
 *
 * ONE TRANSACTION, OR NOTHING. The interface, its first snapshot (1.0.0,
 * `origin` UPLOAD, no environment and no connection), its /schema texts, a
 * write interface's request schema stamp, and the CREATE audit row — written
 * in the transaction, not best effort, because an interface whose contract
 * came from a file must say so where it was made.
 *
 * NO VERIFICATION IS RECORDED. The interface has no serviceVerifications, so
 * the write route refuses it until a tenant verify (P1.1's rule), and every
 * screen and /schema say the contract came from a file (describedBy). A
 * verify that finds the same description makes the row its own (origin
 * VERIFY, its environment and connection: snapshot.ts), so from then on they
 * say a tenant described it.
 */

import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { runContractJob } from "@/lib/contracts/envelope";
import type { CompiledService, EnvelopeRefusal } from "@/lib/contracts/jobs";
import type { RequestSchemaStamp } from "@/lib/contracts/request-schema";
import { insertSnapshotRow, setSchemaTexts, type SnapshotSummary } from "@/lib/contracts/snapshot";
import { prisma } from "@/lib/db/prisma";
import type { ODataVersion } from "@/lib/sap-public/service-path";
import type { TenantScope } from "@/lib/studio/tenant-scope";

/**
 * The largest description an upload takes: 4 MiB, under the platform's 4.5 MB
 * request-body limit (Vercel), with room for the form's own bytes. The
 * compiler accepts 8 MiB from a tenant; a description past 4 MiB is verified
 * from the tenant instead (the product owner's Q6).
 */
export const MAX_UPLOAD_DESCRIPTION_BYTES = 4 * 1024 * 1024;
/** The form around the file: its boundaries, headers and the `fields` part. */
export const UPLOAD_FORM_OVERHEAD_BYTES = 64 * 1024;
/** The `fields` part: the interface's settings as JSON. */
export const MAX_UPLOAD_FIELDS_BYTES = 8 * 1024;

/** How many dataset names a NO_SUCH_ENTITY_SET answer lists. */
const LISTED_DATASETS = 20;

export const UPLOAD_TOO_LARGE_MESSAGE =
  `The description is larger than ${MAX_UPLOAD_DESCRIPTION_BYTES / (1024 * 1024)} MB, which is as much as an upload can carry. ` +
  "Register the service by its path instead and verify it from the tenant: CoreEdge then reads the description from the system itself.";

/** What the interface is: the shared fields (interface-input.ts), resolved. */
export interface UploadInterfaceFields {
  solutionId: string;
  sapProduct: string;
  name: string;
  operation: "READ" | "CREATE" | "UPDATE";
  entitySet: string;
  externalId: string;
  servicePath: string | null;
  odataVersion: ODataVersion | null;
}

export type UploadRefusal =
  /** The compiler or its envelope did not give a contract; `retryAfterSeconds` when a wait clears it. */
  | { kind: "ENVELOPE"; reason: EnvelopeRefusal; detail: string; retryAfterSeconds?: number }
  /** The compiler read the file and refused it (INVALID_CSDL, TOO_LARGE, TOO_DEEP, DOCTYPE …): its sentence. */
  | { kind: "COMPILER"; reason: string; detail: string }
  | { kind: "NO_SUCH_ENTITY_SET"; detail: string; datasets: string[] }
  | { kind: "VERSION_MISMATCH"; detail: string }
  | { kind: "CONTRACT"; reason: string; detail: string };

export type UploadOutcome =
  | {
      ok: true;
      interface: {
        id: string;
        name: string;
        externalId: string;
        sapProduct: string;
        operation: string;
        mode: string;
        status: string;
        version: number;
        solutionId: string;
        servicePath: string | null;
        odataVersion: string | null;
        entitySet: string | null;
      };
      snapshot: SnapshotSummary;
      requestSchemaWritten: boolean;
    }
  | { ok: false; refusal: UploadRefusal };

/** A description's digest, for the audit row: what was uploaded, without keeping it. */
export function descriptionDigest(text: string): { sha256: string; bytes: number } {
  return { sha256: createHash("sha256").update(text, "utf8").digest("hex"), bytes: Buffer.byteLength(text, "utf8") };
}

/** The compiled service against what the interface declares: its OData version and its dataset. */
function checkCompiled(
  compiled: Extract<CompiledService, { ok: true }>,
  declaredVersion: ODataVersion,
  entitySet: string,
): UploadRefusal | null {
  if (compiled.odataVersion !== declaredVersion) {
    return {
      kind: "VERSION_MISMATCH",
      detail: `The description is OData ${compiled.odataVersion === "V4" ? "V4" : "V2"}, and the service is declared as OData ${declaredVersion}. Upload the service's own description, or correct the version.`,
    };
  }
  const prepared = compiled.dataset;
  if (!prepared) return { kind: "CONTRACT", reason: "NO_DATASET", detail: "The description was compiled without the dataset. Upload it again." };
  if (!prepared.ok) {
    if (prepared.reason === "NO_SUCH_ENTITY_SET" || prepared.reason === "NO_SUCH_ENTITY_TYPE") {
      const names = compiled.datasets.names.slice(0, LISTED_DATASETS);
      const suggestion = compiled.datasets.suggestion ? ` Did you mean ${compiled.datasets.suggestion}? Dataset names are case-sensitive.` : "";
      return {
        kind: "NO_SUCH_ENTITY_SET",
        detail:
          `The description declares no dataset called ${entitySet}.${suggestion}` +
          (names.length > 0 ? ` It declares ${names.join(", ")}${compiled.datasets.count > names.length ? `, and ${compiled.datasets.count - names.length} more` : ""}.` : ""),
        datasets: names,
      };
    }
    return { kind: "CONTRACT", reason: prepared.reason, detail: prepared.detail };
  }
  return null;
}

/**
 * Compile the description in the envelope, check it against the interface,
 * and create the interface with its first contract in one transaction.
 * `declaredVersion` is the version the interface's service is known by: the
 * own service's declared one, or the catalogue service's (record.ts
 * serviceODataVersion). Nothing is created on any refusal.
 */
export async function createInterfaceFromDescription(input: {
  scope: TenantScope;
  actorId: string;
  fields: UploadInterfaceFields;
  declaredVersion: ODataVersion;
  description: string;
  deadlineAt: number;
  /** For a test: called inside the transaction, after the snapshot is written. */
  afterSnapshot?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<UploadOutcome> {
  const { scope, fields } = input;
  const job = await runContractJob(
    "record",
    async () => ({
      kind: "record",
      input: { description: input.description, entitySet: fields.entitySet, previous: [], unchangedHashes: [], current: null },
    }),
    { tenant: scope.organizationId, deadlineAt: input.deadlineAt },
  );
  if (!job) return { ok: false, refusal: { kind: "ENVELOPE", reason: "INTERNAL", detail: "The description could not be prepared." } };
  if (!job.ok) {
    const retryAfterSeconds =
      job.reason === "BUSY" ? 5 : job.retryAfterMs !== undefined ? Math.max(1, Math.ceil(job.retryAfterMs / 1000)) : undefined;
    return { ok: false, refusal: { kind: "ENVELOPE", reason: job.reason, detail: job.detail, ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) } };
  }
  const compiled = job.value;
  if (!compiled.ok) return { ok: false, refusal: { kind: "COMPILER", reason: compiled.reason, detail: compiled.detail } };
  const refused = checkCompiled(compiled, input.declaredVersion, fields.entitySet);
  if (refused) return { ok: false, refusal: refused };
  const contract = compiled.dataset as Extract<NonNullable<typeof compiled.dataset>, { ok: true }>;
  const digest = descriptionDigest(input.description);
  const mode = fields.operation === "READ" ? "READ" : "WRITE";

  return prisma.$transaction(async (tx) => {
    const created = await tx.interface.create({
      data: {
        solutionId: fields.solutionId,
        organizationId: scope.organizationId,
        name: fields.name,
        sapProduct: fields.sapProduct,
        externalId: fields.externalId,
        operation: fields.operation,
        entitySet: fields.entitySet,
        ...(fields.servicePath !== null ? { servicePath: fields.servicePath, odataVersion: fields.odataVersion } : {}),
        mode,
        status: "DRAFT",
      },
      select: {
        id: true,
        name: true,
        externalId: true,
        sapProduct: true,
        operation: true,
        mode: true,
        status: true,
        version: true,
        solutionId: true,
        servicePath: true,
        odataVersion: true,
        entitySet: true,
      },
    });
    const iface = { id: created.id, version: created.version, externalId: created.externalId, entitySet: fields.entitySet };
    const snapshot = await insertSnapshotRow(tx, {
      scope,
      iface,
      contract,
      semver: "1.0.0",
      diffText: null,
      // No tenant was asked: no environment, no connection (the SAMPLED line's null, kept apart by `origin`).
      environment: null,
      connectionId: null,
      createdById: input.actorId,
      origin: "UPLOAD",
    });
    await setSchemaTexts(tx, scope, created.id, snapshot.id, contract.texts);
    await input.afterSnapshot?.(tx);
    // A write interface whose contract has the body it sends: the stamp /schema serves it by (record.ts writes the same).
    let requestSchemaWritten = false;
    if (mode === "WRITE" && (fields.operation === "UPDATE" ? contract.facts.bodies.update : contract.facts.bodies.create)) {
      const stamp: RequestSchemaStamp = {
        snapshotId: snapshot.id,
        semver: snapshot.semver,
        contentHash: snapshot.contentHash,
        interfaceVersion: created.version,
        entitySet: fields.entitySet,
        operation: fields.operation,
      };
      await tx.interface.updateMany({
        where: { id: created.id, organizationId: scope.organizationId },
        data: { requestSchemaStamp: { "x-contract": stamp } as unknown as Prisma.InputJsonObject },
      });
      requestSchemaWritten = true;
    }
    // Fail closed: in the transaction, not writeConfigAudit's best effort.
    await tx.configAudit.create({
      data: {
        organizationId: scope.organizationId,
        actorId: input.actorId,
        entityType: "Interface",
        entityId: created.id,
        action: "CREATE",
        after: {
          ...created,
          contract: { snapshotId: snapshot.id, semver: snapshot.semver, contentHash: snapshot.contentHash, origin: "UPLOAD" },
          upload: { sha256: digest.sha256, bytes: digest.bytes, format: compiled.format },
        } as unknown as Prisma.InputJsonObject,
      },
    });
    return { ok: true as const, interface: created, snapshot, requestSchemaWritten };
  });
}
