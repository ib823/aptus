/**
 * GET /api/northbound/interfaces/[id]/schema — the contract, without a SAP call.
 *
 * Returns the interface's stored request/response schema so a client can
 * validate locally, generate types, or drive a mock. Deliberately makes NO live
 * call: fetching a contract should never cost a request against a customer's
 * production tenant, and should keep working when that tenant is down.
 *
 * Same authorization as the data read, minus the grant requirement: knowing the
 * SHAPE of an interface your own solution defined is not access to the client's
 * data. The grant governs reading records, which is what actually matters.
 *
 * NEVER AN OLDER CONTRACT'S SHAPE (P0.4, A38). A changed entity set bumps the
 * version; this route used to answer the new entity set and version with the
 * schema captured from the old one, under `schemaCaptured: true`. It now
 * serves a captured schema only when its stamp matches the interface's
 * current version and entity set (contract-provenance.ts), and otherwise says
 * which of the three it is: never captured, captured under an earlier
 * contract, or of a contract that cannot be established.
 *
 * THE COMPILED CONTRACT, ADDITIVELY (P1.3). `contract` says where this
 * interface's contract came from — the service's own description
 * ("metadata"), sampled rows ("sampled") or nowhere yet ("none") — with its
 * semantic version and its JSON Schemas (record, create, update, key). It is
 * read from the snapshot recorded at verification time; nothing is compiled
 * here. `requestSchema`, null until now because nothing wrote it, is the
 * compiled body of a write interface's write, served while it describes the
 * current contract. Every field that was here before means what it meant.
 *
 * BOUNDED (hostile-input review round 2). The schemas are rendered on every
 * call, so only for a contract inside the documents' budget
 * (MAX_DOCUMENT_CONTRACT_BYTES, the same as the verify's MAX_CONTRACT_BYTES:
 * a contract that is accepted is servable here, in the kit and in the
 * solution document), checked from the size kept at record time before the
 * IR is read; past it `schemas` is null and `schemasOmitted` says why. What
 * is rendered is linear in the contract, with the bound asserted in
 * tests/unit/contracts/hostile-input.test.ts. `requestSchema` is rendered
 * from the same snapshot: the row keeps only its stamp.
 *
 * AND UNDER THE SHARED OUTPUT BUDGET (budget.ts, schemaLimit of the
 * contract's kept size): what this answer would carry is counted by the one
 * writer, which stops at the budget, before it is serialised. The record
 * rendered and measured the same contract under the same budget inside the
 * compiler's envelope before storing it (pipeline.ts), so nothing served
 * here is computed for the first time on this thread.
 *
 * EVERYTHING IT RETURNS IS CHARGED TO THAT ONE BUDGET (structural hardening
 * round 1). The captured `responseSchema` used to be served whole, outside
 * it: an 11.5 MB schema stored from one hostile row went out on every call
 * of a route whose budget, with no contract, was 64 KB. Now its stored size
 * is read from the database first and a schema past the captured-schema
 * bound (LIMITS.capturedSchema) is never read; one that is read is charged
 * to the answer's budget, which allows it exactly that bound beside the
 * contract's schemas. Past it `responseSchema` is null and
 * `responseSchemaOmitted` says why, as `schemasOmitted` does for a contract.
 *
 * AND NEVER MORE THAN A FIXED SHARE OF THE REQUEST THREAD (structural
 * hardening rounds 2 and 3). A contract inside every cap rendered 13 MB here,
 * half a second to a second of blocked event loop, on every call. The
 * schemas are now rendered by renderReadPathLazy (read-render.ts): here while
 * the stored contract is small and the thread's share of render time allows,
 * in the compiler's envelope otherwise — where the IR is read only once the
 * read holds a render slot, and the bytes that come back are spliced into
 * the answer as they are. A read waits its turn for a slot; one that gets
 * none before its deadline leaves `schemas` null with
 * `schemasOmitted: "UNAVAILABLE"`, to retry.
 */

import type { NextRequest } from "next/server";

import { authenticateClientToken, extractBearer, touchClientLastUsed } from "@/lib/northbound/auth";
import { noteFailedCredential } from "@/lib/northbound/auth-failures";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import {
  newCorrelationId,
  northboundError,
  northboundOkJson,
  northboundThrottleRefusal,
  unauthenticated,
} from "@/lib/northbound/respond";
import { RawJson, renderReadPathLazy, type ReadLoad } from "@/lib/contracts/read-render";
import { withNorthboundVersion } from "@/lib/northbound/versioned-route";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { withheldArtifactNote } from "@/lib/studio/contract-provenance";
import { capturedSchemaFacts, readCurrentCapturedSchemas } from "@/lib/studio/response-schema-states";
import { scopedById } from "@/lib/studio/tenant-scope";
import { BudgetExceeded, chargeJson, LIMITS, OutputBudget, schemaLimit } from "@/lib/contracts/budget";
import { MAX_DOCUMENT_CONTRACT_BYTES } from "@/lib/contracts/doc-inputs";
import { currentSnapshotSummaries, snapshotContractTexts } from "@/lib/contracts/snapshot";

export const dynamic = "force-dynamic";
/** A large contract's schemas render in a worker thread (lib/contracts/read-render.ts): Node.js only. */
export const runtime = "nodejs";

/**
 * Served as every supported version of the northbound API, at
 * /api/northbound/* and at /api/northbound/v1/* (which re-exports this):
 * versioned-route.ts resolves CoreEdge-Version, stamps it on the response,
 * and names the version and path on every audit row this call writes (P1.10).
 */
export const GET = withNorthboundVersion(readSchema);

async function readSchema(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = newCorrelationId();

  const bearer = extractBearer(request.headers.get("authorization"));
  const auth = await authenticateClientToken(bearer);
  if (!auth.ok) {
    console.warn("[northbound] auth rejected", { reason: auth.reason, correlationId });
    // A key matching no row spends the address's failed-lookup budget, which
    // the edge reads first; a real key that refuses is bounded by its own.
    await noteFailedCredential(request.headers, bearer, auth.reason);
    return unauthenticated(correlationId);
  }
  const client = auth.client;
  void touchClientLastUsed(client.clientId, client.organizationId);

  const { id } = await ctx.params;

  // Per-credential throttle + audit, like discovery — see that route's comment.
  // A stolen token pulling every stored contract used to leave no trace.
  const rate = await checkRateLimit(`northbound:${client.clientId}`, RATE_LIMITS.northbound);
  if (!rate.allowed) {
    // 429 for this credential's own use, 503 when the limiter is down (A44).
    const refusal = northboundThrottleRefusal(rate, correlationId, "Too many requests. Slow down and retry.");
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: id,
      operation: "READ",
      externalId: "-schema-",
      environment: client.environment,
      status: refusal.status,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
      failureReason: refusal.failureReason,
    });
    return refusal.response;
  }

  const iface = await prisma.interface.findFirst({
    where: scopedById(client.scope, id),
    select: {
      id: true,
      name: true,
      externalId: true,
      sapProduct: true,
      operation: true,
      entitySet: true,
      mode: true,
      version: true,
      requestSchema: true,
      // Not responseSchema: its size is read first, and it only when bounded (below).
      solutionId: true,
    },
  });

  // "Not yours" and "does not exist" are the same answer, so a client cannot
  // probe for interfaces outside its own solution.
  if (!iface || iface.solutionId !== client.solutionId) {
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: id,
      operation: "READ",
      externalId: "-schema-",
      environment: client.environment,
      status: 404,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
    });
    return northboundError("NOT_FOUND", "No such interface.", 404, correlationId);
  }

  // The captured schema's stamp and stored size, from the database; the schema
  // itself only when it describes this contract and is inside its bound.
  const facts = (await capturedSchemaFacts(client.organizationId, [iface])).get(iface.id) ?? { state: "none" as const, storedBytes: null };
  const schemaState = facts.state;
  const captured =
    schemaState === "current"
      ? ((await readCurrentCapturedSchemas(client.organizationId, [iface], new Map([[iface.id, facts]]))).get(iface.id) ?? null)
      : null;
  // The summary first, without its IR: what it is and how large.
  const current = (await currentSnapshotSummaries(client.scope, [iface])).get(iface.id) ?? null;
  // A SAMPLED snapshot is the captured schema with a version, so it follows
  // that capture's provenance (A38): served only while the capture is of
  // THIS contract, exactly as the kit and the solution document decide. A
  // compiled one describes the dataset whatever else changed.
  const servable = current && (current.source === "METADATA" || schemaState === "current") ? current : null;
  // THE DOCUMENTS' BUDGET (doc-inputs.ts), from the size kept at record time
  // and before the IR is read: a snapshot past it is named, not rendered.
  const inBudget = (bytes: number | null) => bytes === null || bytes <= MAX_DOCUMENT_CONTRACT_BYTES;
  let tooLarge = servable !== null && !inBudget(servable.irBytes);
  // The captured schema, within its own share (LIMITS.capturedSchema.served):
  // what is served beside the contract's schemas, and charged as such.
  let responseSchema: unknown = null;
  let responseSchemaTooLarge = captured !== null && !captured.ok;
  if (captured?.ok) {
    try {
      chargeJson(captured.schema, new OutputBudget("capturedSchema", LIMITS.capturedSchema.served));
      responseSchema = captured.schema;
    } catch (err) {
      if (!(err instanceof BudgetExceeded)) throw err;
      responseSchemaTooLarge = true;
    }
  }
  /*
   * RENDERED UNDER THE READ PATH'S BUDGET (budget.ts, schemaLimit of the
   * contract's kept size — the captured schema has its own share, above, and
   * is not added to it: structural hardening round 3): the schemas and the
   * write body beside them are counted by the one writer, which stops at the
   * budget. The record rendered this same contract under this same budget in
   * the envelope before storing it (pipeline.ts), so a contract recorded
   * since is always inside it; a row from before is refused here, not
   * rendered without bound.
   *
   * ROUTED BY COST, LOADED IN TURN (read-render.ts, round 3): a real contract
   * renders on this thread in milliseconds, within the thread's share of
   * render time; a large one renders in the envelope, and its IR is read from
   * the database only once it holds a render slot — a read refused for want
   * of one has read nothing.
   */
  const raw = new RawJson();
  let schemas: string | null = null;
  let requestSchema: string | null = null;
  let unavailable = false;
  let rendered = false;
  if (servable && !tooLarge) {
    const r = await renderReadPathLazy(
      { inputBytes: servable.irBytes },
      async (): Promise<ReadLoad<"GONE" | "TOO_LARGE">> => {
        // Its IR as its stored text, parsed where it renders (snapshotContractTexts).
        const read = (await snapshotContractTexts(client.scope, new Map([[iface.id, servable]]))).get(iface.id) ?? null;
        if (!read) return { ok: false, refusal: "GONE" };
        // A row that predates the kept size, measured now.
        if (!inBudget(read.irBytes)) return { ok: false, refusal: "TOO_LARGE" };
        return {
          ok: true,
          input: {
            path: "schema",
            contract: read.contract,
            entitySet: read.entitySet,
            snapshotId: read.id,
            requestSchema: iface.requestSchema,
            iface: { version: iface.version, entitySet: iface.entitySet },
            limit: schemaLimit(read.irBytes),
          },
        };
      },
      { tenant: client.organizationId },
    );
    if (r.ok) {
      schemas = raw.slot(r.texts[0]!);
      requestSchema = raw.slot(r.texts[1]!);
      rendered = true;
    } else if (r.reason === "UNAVAILABLE") unavailable = true;
    // GONE: the snapshot went while this read was waiting — served as if there were none.
    else if (r.reason !== "REFUSED" || r.refusal === "TOO_LARGE") tooLarge = true;
  }
  const shown = rendered || tooLarge || unavailable ? servable : null;
  const contract = shown
    ? {
        source: shown.source === "METADATA" ? ("metadata" as const) : ("sampled" as const),
        semver: shown.semver,
        snapshotId: shown.id,
        contentHash: shown.contentHash,
        odataVersion: shown.odataVersion,
        compiledAt: shown.createdAt.toISOString(),
        schemas,
        // Additive: why there are no schemas for a contract that is there.
        ...(tooLarge
          ? {
              schemasOmitted: "TOO_LARGE" as const,
              schemasNote: `This contract's schemas are larger than a generated document may carry (${Math.floor(MAX_DOCUMENT_CONTRACT_BYTES / (1024 * 1024))} MB of contract, rendered within a fixed multiple of it), so they are not rendered. Narrow the interface's dataset and verify again.`,
            }
          : unavailable
            ? {
                schemasOmitted: "UNAVAILABLE" as const,
                schemasNote: "This contract's schemas could not be rendered just now (too many large contracts are being rendered at once). Retry in a moment.",
              }
            : {}),
      }
    : {
        // No snapshot to serve: the captured schema (responseSchema, above)
        // is all there is, or nothing is.
        source: schemaState === "current" ? ("sampled" as const) : ("none" as const),
        semver: null,
        snapshotId: null,
        contentHash: null,
        odataVersion: null,
        compiledAt: null,
        schemas: null,
      };

  await recordNorthboundCall({
    organizationId: client.organizationId,
    solutionId: client.solutionId,
    interfaceId: iface.id,
    operation: "READ",
    externalId: "-schema-",
    environment: client.environment,
    status: 200,
    rowCount: null,
    correlationId,
    clientTokenId: client.clientId,
  });

  // The rendered schemas are spliced in as they were written (RawJson): the
  // same bytes NextResponse.json would send, never parsed back on this thread.
  const body = raw.bytes({
    data: {
      id: iface.id,
      name: iface.name,
      externalId: iface.externalId,
      sapProduct: iface.sapProduct,
      operation: iface.operation,
      entitySet: iface.entitySet,
      mode: iface.mode,
      version: iface.version,
      // The compiled write body, while it describes THIS contract (P1.3).
      // Rendered from the stamped snapshot, which is the one just rendered;
      // the row stores only the stamp (record.ts).
      requestSchema,
      // Of THIS contract only, and as the served rows can satisfy it: a schema
      // captured before the broker stripped SAP's envelope still requires V2's
      // deferred navigations, which no served row carries (servedResponseSchema).
      responseSchema,
      // Additive: why there is no responseSchema for a capture that is there.
      ...(responseSchemaTooLarge
        ? {
            responseSchemaOmitted: "TOO_LARGE" as const,
            responseSchemaNote: `This contract's captured schema is larger than a captured schema may be (${LIMITS.capturedSchema.properties.toLocaleString("en")} fields, ${LIMITS.capturedSchema.bytes / 1024} KB), so it is not served. Run the interface in the Test Console and capture again, or verify the service to compile its contract.`,
          }
        : {}),
      // Said out loud because a null schema is a real state, not a bug: nobody
      // has captured one for this contract yet.
      schemaCaptured: schemaState === "current",
      // Why there is none, when there is none: "none" (never captured),
      // "stale" (captured under an earlier contract) or "unverified" (captured
      // before captures were stamped, contract unknown). Additive.
      schemaState,
      ...(schemaState === "stale" || schemaState === "unverified"
        ? { schemaNote: withheldArtifactNote(schemaState, iface) }
        : {}),
      // Additive (P1.3): the compiled contract and where it came from.
      contract,
    },
  });
  return northboundOkJson(body, correlationId);
}
