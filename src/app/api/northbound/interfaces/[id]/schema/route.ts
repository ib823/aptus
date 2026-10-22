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
 * NEVER RENDERED HERE (P1.3, the Contract Compiler's containment). This is
 * the one high-frequency, consumer-facing read of a contract, so it renders
 * nothing: the schemas and the create and update bodies were rendered ONCE,
 * in the compiler's worker, when the snapshot was recorded (jobs.ts), and are
 * stored on the snapshot row as compact JSON, at most 1 MiB together. This
 * route reads the interface, the current snapshot's summary (with the texts'
 * sizes), and one row of texts — the schemas and the one body its stamp
 * needs — and splices them into the answer as they are (RawJson), the same
 * bytes NextResponse.json would have sent. It never touches the compiler's
 * gate, its allowance or a worker, so it is never refused for capacity.
 *
 * A current snapshot without texts (recorded before they were kept, or no
 * longer the row a verify last rendered: the interface pointed back at an
 * earlier dataset) answers `schemas: null` with `schemasOmitted:
 * "NOT_RENDERED"` and a note saying what renders them (a verify for a
 * compiled contract, a capture for a sampled one). Texts the summary counted
 * but that a record moved to its new row between the two reads are not
 * missing: the new head is read once more and served (consolidated
 * containment review round 6). A row past the documents'
 * budget (MAX_DOCUMENT_CONTRACT_BYTES, kept at record time) is
 * `schemasOmitted: "TOO_LARGE"`.
 *
 * THE CAPTURED SCHEMA IS BOUNDED (structural hardening round 1). Its stored
 * size is read from the database first and a schema past the captured-schema
 * bound (LIMITS.capturedSchema) is never read; one that is read is charged to
 * its own share (LIMITS.capturedSchema.served). Past it `responseSchema` is
 * null and `responseSchemaOmitted` says why.
 */

import type { NextRequest } from "next/server";

import { authenticateClientToken, extractBearer, touchClientLastUsed } from "@/lib/northbound/auth";
import { noteFailedCredential } from "@/lib/northbound/auth-failures";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import {
  FAILURE_REASON_ORG_SCHEMA_RATE,
  newCorrelationId,
  northboundError,
  northboundOkJson,
  northboundThrottleRefusal,
  unauthenticated,
} from "@/lib/northbound/respond";
import { withNorthboundVersion } from "@/lib/northbound/versioned-route";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { withheldArtifactNote } from "@/lib/studio/contract-provenance";
import { capturedSchemaFacts, readCurrentCapturedSchemas } from "@/lib/studio/response-schema-states";
import { scopedById } from "@/lib/studio/tenant-scope";
import { BudgetExceeded, chargeJson, LIMITS, OutputBudget } from "@/lib/contracts/budget";

/** The documents' budget (doc-inputs.ts, MAX_DOCUMENT_CONTRACT_BYTES): a contract past it is named, not served. */
const MAX_DOCUMENT_CONTRACT_BYTES = LIMITS.document.contractsCap;
import { RawJson } from "@/lib/contracts/raw-json";
import { currentRequestSchemaStamp, requestSchemaText } from "@/lib/contracts/request-schema";
import { currentSnapshotSummaries, snapshotSchemaTexts } from "@/lib/contracts/snapshot";

export const dynamic = "force-dynamic";
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
  // Then the organisation's own bucket: it mints credentials without bound,
  // and every read copies up to 1 MiB of texts (RATE_LIMITS.northboundSchemaPerOrg).
  let rate = await checkRateLimit(`northbound:${client.clientId}`, RATE_LIMITS.northbound);
  const byOrganisation = rate.allowed;
  if (byOrganisation) rate = await checkRateLimit(`northbound-schema:${client.organizationId}`, RATE_LIMITS.northboundSchemaPerOrg);
  if (!rate.allowed) {
    // 429 for this credential's own use, 503 when the limiter is down (A44).
    // The organisation's bucket says so, in its words and on its audit row:
    // slowing this one credential down does not help (review round 2).
    const refusal = byOrganisation
      ? northboundThrottleRefusal(
          rate,
          correlationId,
          `Your organisation's credentials together have read /schema ${RATE_LIMITS.northboundSchemaPerOrg.limit} times this minute. Retry after Retry-After.`,
          FAILURE_REASON_ORG_SCHEMA_RATE,
        )
      : northboundThrottleRefusal(rate, correlationId, "Too many requests. Slow down and retry.");
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
  // A SAMPLED snapshot is the captured schema with a version, so it follows
  // that capture's provenance (A38): served only while the capture is of
  // THIS contract, exactly as the kit and the solution document decide. A
  // compiled one describes the dataset whatever else changed.
  const servableNow = async () => {
    const current = (await currentSnapshotSummaries(client.scope, [iface])).get(iface.id) ?? null;
    return current && (current.source === "METADATA" || schemaState === "current") ? current : null;
  };
  let servable = await servableNow();
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
   * THE STORED TEXTS (see the header): the schemas, and the write body the
   * stamp names while it describes this snapshot — one statement, spliced in
   * as they are. Nothing here is rendered, parsed or re-encoded.
   */
  const raw = new RawJson();
  let schemas: string | null = null;
  let requestSchema: string | null = null;
  let notRendered = false;
  for (let attempt = 0; servable && !tooLarge; attempt++) {
    const stamp = currentRequestSchemaStamp(iface.requestSchema, iface, servable.id);
    const texts = servable.schemasBytes === null ? null : await snapshotSchemaTexts(client.scope, servable.id, stamp ? (stamp.operation === "UPDATE" ? "UPDATE" : "CREATE") : null);
    if (texts?.schemas != null) {
      schemas = raw.slot(texts.schemas);
      const body = stamp ? requestSchemaText(texts.body, stamp) : null;
      if (body !== null) requestSchema = raw.slot(body);
      break;
    }
    // The summary and the texts are two statements, and a record moves the
    // texts to its new row in one transaction (snapshot.ts, setSchemaTexts):
    // texts the summary counted but that are gone were superseded in between
    // (consolidated containment review round 6). The new head is read once.
    const head = attempt === 0 && servable.schemasBytes !== null ? await servableNow() : null;
    if (head === null || head.id === servable.id) {
      notRendered = true;
      break;
    }
    servable = head;
    tooLarge = !inBudget(head.irBytes);
  }
  const contract = servable
    ? {
        source: servable.source === "METADATA" ? ("metadata" as const) : ("sampled" as const),
        semver: servable.semver,
        snapshotId: servable.id,
        contentHash: servable.contentHash,
        odataVersion: servable.odataVersion,
        compiledAt: servable.createdAt.toISOString(),
        schemas,
        // Additive: why there are no schemas for a contract that is there.
        ...(tooLarge
          ? {
              schemasOmitted: "TOO_LARGE" as const,
              schemasNote: `This contract's schemas are larger than a generated document may carry (${Math.floor(MAX_DOCUMENT_CONTRACT_BYTES / (1024 * 1024))} MB of contract, rendered within a fixed multiple of it), so they are not rendered. Narrow the interface's dataset and verify again.`,
            }
          : notRendered
            ? {
                schemasOmitted: "NOT_RENDERED" as const,
                // By source (review round 2): a sampled contract's texts are
                // written by a capture, or by a verify only if its description
                // compiles and records; "verify again" alone can never help it.
                schemasNote:
                  servable.source === "SAMPLED"
                    ? "This contract's schemas were not rendered when it was recorded, so they are not served. Capture the schema again in the Test Console to render them (or verify the service, if its description compiles)."
                    : "This contract's schemas were not rendered when it was recorded, so they are not served. Verify the service again to render them.",
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

  // The stored texts are spliced in as they were written (RawJson): the
  // same bytes NextResponse.json would send, never parsed on this thread.
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
      // The compiled write body, while it describes THIS contract (P1.3):
      // the stamped snapshot's stored body, with the stamp (record.ts).
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
