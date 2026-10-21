/**
 * POST /api/studio/interfaces/[id]/capture-schema
 *
 * Records what a live read actually returned, so the generated contract can stop
 * saying "shape unknown" and start describing real fields.
 *
 * THE ROWS ARE NOT STORED. Only the inferred SHAPE is — field names, observed
 * types, and which fields were present in every row. A client's business records
 * have no business sitting in our database as a side effect of generating a
 * contract, and storing them would quietly turn a governance table into a copy
 * of the customer's data.
 *
 * The sample comes from the Test Console, which has already performed the read
 * through the throttled live path — so capturing costs no additional SAP call.
 *
 * STAMPED WITH THE CONTRACT IT DESCRIBES (P0.4, A38). The schema records the
 * interface version and entity set it was captured under, and readers publish
 * it only while those still match (contract-provenance.ts). The console sends
 * the version its run was against; a capture from a run of an earlier
 * contract is refused with 409, and so is one that loses a race with a
 * contract change — the write is conditional on the version it stamps.
 *
 * THE FALLBACK CONTRACT (P1.3). While no contract compiled from the service's
 * own description describes the interface, the captured shape is also
 * recorded as a SAMPLED ContractSnapshot, so the contract has a version and a
 * history either way. A compiled one is never pushed aside by a sample.
 *
 * PARSED ONLY IN THE CONTRACT COMPILER'S WORKER (P1.3). The rows come from
 * the tenant's SAP system, which an attacker may control: one row of 358,000
 * distinct keys cost seconds of inference on this thread. Now the body is
 * read as text up to LIMITS.capturedSchema.requestBytes and no further (past
 * it: its own message, S12), and a capture job (jobs.ts) — through the
 * compiler's one fair gate, charged to the organisation's daily compiler
 * time — parses and validates it, infers the schema (stopping past
 * `properties` fields, refusing past `bytes`), and makes the sampled
 * contract with its /schema texts. What comes back is written in ONE
 * transaction (record.ts, recordCapture): the schema on the interface, and
 * the SAMPLED snapshot with its texts — or nothing. A capture the compiler
 * could not take (busy, its time spent) stores nothing and says so.
 */

import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { studioError, studioOk } from "@/lib/studio/api";
import { LIMITS } from "@/lib/contracts/budget";
import { jobRefusal, STUDIO_JOB_DEADLINE_MS } from "@/lib/contracts/doc-inputs";
import { runContractJob } from "@/lib/contracts/envelope";
import { CaptureConflict, recordCapture, serviceODataVersion } from "@/lib/contracts/record";
import { currentSnapshotSummaries, loadRecordHeads, type RecordHeads } from "@/lib/contracts/snapshot";
import { readTextCapped } from "@/lib/security/bounded-body";
import { writeConfigAudit } from "@/lib/studio/audit";
import { captureContractMismatch } from "@/lib/studio/contract-provenance";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, tenantScopeFor } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";
/** The capture runs in a worker thread (lib/contracts/envelope.ts): Node.js only. */
export const runtime = "nodejs";

const TOO_LARGE_MESSAGE =
  `These rows describe more than a captured schema may hold (${LIMITS.capturedSchema.properties.toLocaleString("en")} fields, ` +
  `${LIMITS.capturedSchema.bytes / 1024} KB), so nothing was captured. Narrow the interface's dataset, or verify the service to compile its contract from its own description.`;

/**
 * The body past its size is a different cause with a different remedy: a few
 * wide rows, or one long value, can pass it while describing a few dozen
 * fields, and narrowing the dataset does nothing for that — fewer rows do.
 */
const BODY_TOO_LARGE_MESSAGE =
  `The sampled rows are larger than ${LIMITS.capturedSchema.requestBytes / (1024 * 1024)} MB together, so nothing was captured. ` +
  "Capture from fewer rows (a smaller $top in the Test Console), or verify the service to compile its contract from its own description.";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (!canMutateStudio(user.role)) {
    return studioError("FORBIDDEN", "Your role can view interfaces but not capture their schema.");
  }
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");

  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return studioError("FORBIDDEN", "No organization scope.");
  const scope = scoped.scope;

  const deadlineAt = Date.now() + STUDIO_JOB_DEADLINE_MS;
  // Read as text, bounded, never parsed here (bounded-body.ts): the capture job parses it.
  const body = await readTextCapped(request, LIMITS.capturedSchema.requestBytes);
  if (!body.ok && body.reason === "TOO_LARGE") return studioError("TOO_LARGE", BODY_TOO_LARGE_MESSAGE);
  if (!body.ok) return studioError("VALIDATION_ERROR", "Expected a non-empty array of rows.");

  const { id } = await ctx.params;
  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, id),
    select: {
      id: true,
      name: true,
      version: true,
      entitySet: true,
      externalId: true,
      odataVersion: true,
      sapProduct: true,
      servicePath: true,
    },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  // The sampled FALLBACK contract is wanted only while no compiled one describes the interface: a description beats a sample.
  const current = (await currentSnapshotSummaries(scope, [iface])).get(iface.id) ?? null;
  const preferred = current?.source === "METADATA" ? { snapshotId: current.id, semver: current.semver } : null;
  const record = preferred === null && iface.entitySet !== null;
  let heads: RecordHeads = { ids: [], previous: [], unchangedHashes: [] };
  const job = await runContractJob(
    "capture",
    async () => {
      // Loaded once the job holds its slot: the heads its sampled contract is diffed against, and its OData version.
      if (record) heads = await loadRecordHeads(scope, iface, null);
      return {
        kind: "capture",
        input: {
          body: body.text,
          capturedAt: new Date().toISOString(),
          iface: { version: iface.version, entitySet: iface.entitySet },
          // The rows reach here without SAP's envelope (the broker strips it), so they cannot say which OData version
          // they are. A catalogue interface stores none either: the service the read went to says it.
          declaredVersion: record ? (iface.odataVersion ?? (await serviceODataVersion(iface))) : null,
          record,
          previous: heads.previous,
          unchangedHashes: heads.unchangedHashes,
        },
      };
    },
    { tenant: scope.organizationId, deadlineAt },
  );
  if (!job) return studioError("INTERNAL", "The capture could not be prepared.");
  if (!job.ok) return jobRefusal("Nothing was captured", job) ?? studioError("TOO_LARGE", TOO_LARGE_MESSAGE);
  const out = job.value;
  if (!out.ok) {
    return out.reason === "TOO_MANY_FIELDS"
      ? studioError("TOO_LARGE", TOO_LARGE_MESSAGE)
      : out.reason === "NO_FIELDS"
        ? // Rows that carried nothing describable. Better to say so than to write an empty schema that looks captured.
          studioError("VALIDATION_ERROR", "Those rows contained no describable fields.")
        : studioError("VALIDATION_ERROR", "Expected a non-empty array of rows.");
  }

  const mismatch = captureContractMismatch(out.claimed, iface);
  if (mismatch) return studioError("CONFLICT", mismatch);

  // Only the shape: the rows themselves are never persisted. One transaction, conditional on the contract stamped:
  // a PATCH that changed it since the read above has already cleared the schema, and this must not put the old one back.
  let contract: Awaited<ReturnType<typeof recordCapture>>;
  try {
    contract = await recordCapture({
      scope,
      iface,
      schema: out.schema,
      contract: out.contract,
      preferred,
      heads,
      actorId: user.id,
    });
  } catch (err) {
    if (!(err instanceof CaptureConflict)) throw err;
    return studioError(
      "CONFLICT",
      "This interface's contract changed while the schema was being captured. Run it again and capture from the new run.",
    );
  }

  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "Interface",
    entityId: iface.id,
    action: "UPDATE",
    after: {
      event: "response_schema_captured",
      fields: out.fields,
      sampleSize: out.sampleSize,
      interfaceVersion: iface.version,
      entitySet: iface.entitySet,
      contract: "semver" in contract ? { status: contract.status, semver: contract.semver } : { status: contract.status },
    },
  });

  return studioOk({
    interfaceId: iface.id,
    fields: out.fields,
    required: out.required,
    sampleSize: out.sampleSize,
    // Additive (P1.3): what became of the sampled fallback contract.
    contract,
  });
}
