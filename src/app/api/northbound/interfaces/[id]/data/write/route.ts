/**
 * POST /api/northbound/interfaces/[id]/data/write — the gated runtime write.
 *
 * This creates a record in a customer's production SAP system on behalf of a
 * machine. It was deliberately withheld until every one of these was in place:
 *
 *   1. IDEMPOTENCY. Required, not optional. A retried request must not create a
 *      second record in a client's ledger, and the key is reserved BEFORE SAP is
 *      touched so a duplicate never reaches the tenant at all.
 *   2. A per-solution WRITE CREDENTIAL — a second secret, distinct from the read
 *      token, so possessing the ability to read never implies the ability to
 *      write.
 *   3. A connection-aware executor, so the record lands in the CLIENT'S tenant
 *      rather than the shared env one.
 *   4. The gate chain below.
 *
 * HUMAN OVERSIGHT SITS AT GRANT APPROVAL, by explicit product decision. A second
 * person approves the WRITE grant with the checklist; the application then
 * writes autonomously within that grant's scope and environment. There is no
 * per-call confirmation, because a machine cannot meaningfully give one — which
 * makes the grant approval, its segregation of duties, and its EXPIRY the load-
 * bearing controls. All three are enforced, and expiry is checked per call.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { noteFirstCall } from "@/lib/coreedge/journey";
import { afterResponse } from "@/lib/governed/after-response";
import {
  authenticate,
  authenticateWriteKey,
  authorise,
  bindConnection,
  callSapWrite,
  carryLastUsedStamp,
  contain,
  GovernedAudit,
  northboundRefusalResponse,
  prefetchedConnectionsFor,
  rateLimit,
  refusal,
  requireWritesEnabled,
  type Refusal,
} from "@/lib/governed/pipeline";
import { customServiceUnverified } from "@/lib/northbound/authorisation";
import {
  completeIdempotencyKey,
  isValidIdempotencyKey,
  releaseIdempotencyKey,
  reserveIdempotencyKey,
} from "@/lib/northbound/idempotency";
import { newCorrelationId, northboundError, northboundOk } from "@/lib/northbound/respond";
import { writeHttpStatusFor } from "@/lib/northbound/write";
import { resolveInterfaceService } from "@/lib/sap-public/interface-service";

export const dynamic = "force-dynamic";

/**
 * How long a retry of a still-running write is told to wait. Short: most writes
 * finish within seconds, and a retry before then only meets this answer again.
 */
const IN_FLIGHT_RETRY_AFTER_SECONDS = 5;

const bodySchema = z.object({
  record: z.record(z.string(), z.unknown()),
  /*
   * STILL ACCEPTED, NO LONGER OBEYED (audit E16).
   *
   * This used to WIN over the governed value — `parsed.data.entity ?? iface.entitySet`
   * — which is the inverse of the read path and the more dangerous direction: the
   * WRITE grant a second person approved names a service, and this field decided
   * which table inside it a record was created in. A caller could be approved to
   * write business partners and write somewhere else entirely.
   *
   * It is kept in the schema rather than dropped so that sending it is REFUSED
   * rather than silently ignored. A field that is accepted and quietly discarded
   * is how a client ends up believing it is writing to one dataset while the
   * broker writes to another — the same class of confusion, arrived at from the
   * other side. See the check below.
   */
  entity: z.string().max(200).optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = newCorrelationId();

  // 1 — authenticate the read identity.
  // The write key's row fields come back in the same statement (P0.19).
  const auth = await authenticate(request.headers, correlationId, "northbound-write", { withWriteKey: true });
  if (!auth.ok) return northboundRefusalResponse(auth.refusal, correlationId);
  const client = auth.value;

  const { id } = await ctx.params;

  /*
   * One row per call, about what it had reached (pipeline.ts GovernedAudit).
   *
   * WHY A REFUSAL REASON ON THE WRITE PATH. The old helper never passed one,
   * so every binding refusal on a WRITE audited as a bare 403 with
   * `bindingRefusal: null` — indistinguishable from a grant-gate denial. The
   * `binding-refused` incident rule counts that column, so the CRITICAL
   * control that exists to catch "a live, granted credential that fails every
   * call" had only ever seen READS. The binding step's refusal carries it.
   *
   * A connection is named only once one has actually been bound. Absent on
   * every refusal before that point, which is itself the truth: no connection
   * was involved.
   */
  const audit = new GovernedAudit(
    {
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      operation: "WRITE",
      environment: client.environment,
      correlationId,
      clientTokenId: client.clientId,
      // Stated on every row, so a row says "none" rather than leaving it out.
      connectionId: null,
      connectionEnvironment: null,
      durationMs: null,
      bindingRefusal: null,
      failureReason: null,
      replayed: false,
    },
    { interfaceId: id, externalId: "-" },
  );
  const refuse = async (r: Refusal) => {
    await audit.refused(r);
    return northboundRefusalResponse(r, correlationId);
  };

  // 2 — the WRITE credential. A separate secret from the bearer token, so a
  // leaked read token cannot write. Sent as its own header, and verified
  // against THIS token's row: a write key minted for the TEST credential does
  // not authorise a call made with the DEV one.
  const writeKey = await authenticateWriteKey(client, request.headers.get("x-coreedge-write-key"));
  if (!writeKey.ok) return refuse(writeKey.refusal);

  // 3 — throttle. Writes get their OWN per-credential bucket, deliberately
  // separate from the read bucket (`northbound:`): a read burst must not be
  // able to starve a write, nor a write burst reads. One credential genuinely
  // holds two independent 60/min budgets. 429 for this credential's own use,
  // 503 when the limiter is down (A44) — either way before the key is
  // reserved, so a retry with it is a fresh try.
  const rate = await rateLimit(`northbound-write:${client.clientId}`, "Too many requests for this client credential.");
  if (!rate.ok) return refuse(rate.refusal);

  // 4 — idempotency key is MANDATORY. Refusing the write outright is the only
  // honest option: without a key a retry is indistinguishable from a new intent,
  // and we would have no way to avoid duplicating a record.
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
    return refuse(
      refusal(
        "resolveInterface",
        "IDEMPOTENCY_KEY_INVALID",
        "An Idempotency-Key header is required for writes (8-255 chars, [A-Za-z0-9_.:-]). Reuse the same key when retrying.",
      ),
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return refuse(refusal("resolveInterface", "BODY_INVALID", "Expected { record: object }."));
  }

  // 5 — authorize: ACTIVE write interface, owned by this solution, with a live
  // approved WRITE grant for this environment. An unsupported operation is a
  // 400, not a 403 (pipeline.ts REFUSAL_STATUS): nothing about access is
  // wrong, it is a gap in the interface's definition. Audited against the id
  // the caller sent, as every refusal before this point is.
  const access = await authorise("WRITE", client.scope, client.solutionId, id, client.environment);
  if (!access.ok) return refuse(access.refusal);
  const iface = access.value;
  audit.about(iface.id, iface.externalId);

  // 6 — resolve the client's OWN connection, and check ITS write flag. A
  // connection with writeEnabled=false is a deliberate per-tenant veto that
  // overrides any grant.
  // The environment binding is STRICTER here than on the read path: a connection
  // that has not declared its landscape is refused outright, however few
  // connections the organization has. `writeEnabled` is not a substitute — it is
  // a per-connection yes/no that says nothing about WHICH landscape it enables
  // writes on, so it cannot stand in for knowing you are not in production.
  const bound = await bindConnection(
    client.organizationId,
    iface.sapProduct,
    client.environment,
    "WRITE",
    client.sapClient,
    prefetchedConnectionsFor(iface),
  );
  if (!bound.ok) return refuse(bound.refusal);
  const { connection, product } = bound.value;

  const enabled = requireWritesEnabled(connection);
  if (!enabled.ok) return refuse(enabled.refusal);

  // The interface's OWN service when it carries one, the catalogue's otherwise —
  // never a fallback from one to the other (see interface-service.ts).
  const resolved = await resolveInterfaceService(product, iface);
  const service = resolved?.service ?? null;
  // The governed value, and only it. A caller-supplied `entity` that disagrees is
  // refused rather than ignored (see bodySchema); one that agrees is a harmless
  // restatement and proceeds.
  const entitySet = iface.entitySet;
  if (parsed.data.entity !== undefined && parsed.data.entity !== entitySet) {
    return refuse(
      refusal(
        "resolveInterface",
        "ENTITY_NOT_YOURS_TO_CHOOSE",
        "The dataset is part of this data feed's definition and cannot be chosen per call. " +
          "Remove `entity` from the request body, or define a feed for the dataset you mean.",
        { audit: { connection } },
      ),
    );
  }
  if (!service || !entitySet) {
    return refuse(
      refusal(
        "resolveInterface",
        service ? "NO_ENTITY_SET" : iface.servicePath ? "SERVICE_PATH_INVALID" : "SERVICE_UNRESOLVED",
        service
          ? "This data feed names no dataset, so there is nowhere to write. Set its entity set in Studio."
          : iface.servicePath
            ? "This interface's own service path is not valid for its product. Fix it in Studio."
            : "The catalogue service could not be resolved.",
        { audit: { connection } },
      ),
    );
  }

  /*
   * A CUSTOM SERVICE WRITES ONLY ONCE VERIFIED — HERE. A catalogue service is
   * a contract SAP published; a path the customer typed is a claim until the
   * system has been asked for its description and answered. The answer is
   * about the system that gave it, so the gate is PER ENVIRONMENT and per
   * binding: this credential's environment must hold a successful verify made
   * through this very connection, SAP client and host (a DEV verify says
   * nothing about PROD). Verification is cleared by every change to the path,
   * version or dataset, so this also stops an edited feed writing somewhere
   * nobody has looked. Refused here — before the idempotency key is reserved
   * — so nothing reaches SAP and the key stays free for the retry after Verify.
   */
  // The same gate the lane board previews (authorisation.ts, P0.2).
  if (resolved!.source === "custom" && customServiceUnverified(iface, client.environment, connection)) {
    return refuse(
      refusal(
        "resolveInterface",
        "CUSTOM_SERVICE_UNVERIFIED",
        `This data feed's own SAP service has not been verified in ${client.environment}, through the connection and SAP client this write uses, since it last changed. Verify it in Studio for ${client.environment} before writing.`,
        { audit: { connection } },
      ),
    );
  }

  // 7 — bind the key to the resolved destination before either upstream call.
  // Reissuing a credential for another landscape must not replay an old write.
  const reservation = await reserveIdempotencyKey({
    scope: client.scope,
    solutionId: client.solutionId,
    interfaceId: iface.id,
    key: idempotencyKey,
    payload: parsed.data,
    destination: {
      environment: client.environment,
      sapClient: connection.client,
      connectionId: connection.id,
      baseUrl: connection.baseUrl,
      servicePath: service.path,
      entitySet,
      interfaceVersion: iface.version,
    },
    // The key's lastUsedAt stamp, when due, rides in the claim's statement
    // rather than costing one of its own after the response (P0.19).
    stamp: carryLastUsedStamp(client),
  });

  if (reservation.outcome === "replay") {
    // Byte-for-byte the original outcome, so a retry is indistinguishable from
    // the first call and the client's retry logic never has to branch.
    //
    // Indistinguishable to the CLIENT, not to the trail. The row is marked as
    // a replay, and names the connection this request was bound to — it got
    // past the binding, and without one it counted as a call refused before
    // reaching any connection. No duration: SAP was not called. Answered
    // before the breaker is asked, so a replay is served while SAP is down.
    await audit.record(reservation.status, { connection, replayed: true });
    return NextResponse.json(reservation.body, {
      status: reservation.status,
      headers: {
        "cache-control": "no-store",
        "x-correlation-id": correlationId,
        "idempotency-replayed": "true",
      },
    });
  }

  /*
   * ONE CODE, TWO OPPOSITE ANSWERS, told apart by Retry-After.
   *
   * A different payload or destination is a client bug: never retried, and a
   * different write takes a new key. A key still in flight is the opposite: the
   * client's own retry arrived while its first attempt was running, and giving
   * up — or re-sending under a new key — either loses the outcome or writes the
   * record twice. Retried with the SAME key once the first attempt finishes, it
   * is answered from the stored outcome. The code stays CONFLICT for both, so a
   * client branching on it today is not broken; Retry-After is what is new.
   */
  if (reservation.outcome === "conflict") {
    return refuse(
      reservation.reason === "PAYLOAD_MISMATCH"
        ? refusal(
            "resolveInterface",
            "IDEMPOTENCY_CONFLICT",
            "This Idempotency-Key was already used with a different payload or SAP destination. Use a new key for a different write.",
          )
        : refusal(
            "resolveInterface",
            "IDEMPOTENCY_IN_FLIGHT",
            "A request with this Idempotency-Key is still in progress. Retry with the same Idempotency-Key after Retry-After to get its outcome; do not send it under a new key.",
            { headers: { "retry-after": String(IN_FLIGHT_RETRY_AFTER_SECONDS) } },
          ),
    );
  }

  // 8 — contain: the circuit breaker for this SAP system, after the replay
  // and conflict answers (neither calls SAP). Observes only, unless
  // COREEDGE_CIRCUIT_BREAKER=enforce. A refusal releases the key: nothing was
  // sent, so a retry with it after Retry-After is a fresh try.
  const circuit = await contain(bound.value, correlationId);
  if (!circuit.ok) {
    await releaseIdempotencyKey(client.scope, reservation.recordId);
    return refuse(circuit.refusal);
  }

  // 9 — write. Timed around the upstream call only — see the read route.
  const sap = await callSapWrite(
    bound.value,
    { servicePath: service.path, entitySet, payload: parsed.data.record },
    circuit.value,
  );
  const { result, durationMs } = sap;
  const status = writeHttpStatusFor(result.status);

  let response: NextResponse;
  if (status >= 400) {
    const code =
      result.status === "NEEDS_SETUP"
        ? "FORBIDDEN"
        : result.status === "NOT_FOUND"
          ? "NOT_FOUND"
          : result.status === "REJECTED"
            ? "VALIDATION_ERROR"
            : result.status === "TIMEOUT"
              ? "UPSTREAM_TIMEOUT"
              : "UPSTREAM_ERROR";
    response = northboundError(code, result.detail, status, correlationId);
  } else {
    response = northboundOk(
      {
        created: true,
        record: result.record,
        location: result.location,
        interface: { id: iface.id, name: iface.name, version: iface.version },
        note: result.detail,
      },
      correlationId,
      201,
    );
  }
  // Persist the actual envelope: retries preserve interface metadata and the
  // original error code/body rather than translating a failure into CONFLICT.
  //
  // ONLY FOR A WRITE SAP MAY HAVE ACTED ON. One that is known not to have been
  // attempted — the credential could not be used, the CSRF handshake failed or
  // timed out, or SAP throttled the POST — releases the key instead. Stored, it
  // replayed a failure that never touched the record for 24 hours, so a client
  // that fixed the cause and retried as the contract says got the old failure
  // back, and could only finish its intent under a new key.
  //
  // Released only on an explicit `false`. Storing can never write twice, so
  // anything less certain than that is stored.
  try {
    if (result.attempted === false) {
      await releaseIdempotencyKey(client.scope, reservation.recordId);
    } else {
      await completeIdempotencyKey(client.scope, reservation.recordId, status, await response.clone().json());
    }
    await audit.record(status, { connection, durationMs, failureReason: result.failureReason });
  } finally {
    // THE BREAKER HEARS LAST. SAP may already have created the record, so its
    // outcome is stored under the key and audited before anything waits on
    // the breaker's store (pipeline.ts SapWriteCall). Bounded, never throws.
    await sap.reportOutcome();
  }
  // The app's first successful call in this environment (P2.12); in memory
  // after this instance's first, and after the response, as on the read route.
  await afterResponse(() =>
    noteFirstCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      environment: connection.environment ?? client.environment,
      channel: "broker",
      status,
    }),
  );
  // Same as the read route: the cause meets the correlation id here and only here.
  if (result.failureReason) {
    console.warn("[northbound] upstream write failed", {
      correlationId,
      failureReason: result.failureReason,
      httpStatus: result.httpStatus,
      durationMs,
    });
  }
  return response;
}
