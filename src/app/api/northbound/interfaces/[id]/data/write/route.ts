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

import type { NextRequest } from "next/server";
import { z } from "zod";

import { resolveWritableInterface } from "@/lib/northbound/access";
import { authenticateClientToken, extractBearer, touchClientLastUsed } from "@/lib/northbound/auth";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import {
  completeIdempotencyKey,
  isValidIdempotencyKey,
  releaseIdempotencyKey,
  reserveIdempotencyKey,
} from "@/lib/northbound/idempotency";
import {
  newCorrelationId,
  northboundError,
  northboundOk,
  unauthenticated,
} from "@/lib/northbound/respond";
import { verifyWriteCredential } from "@/lib/northbound/write-credential";
import { writeEntitySet, writeHttpStatusFor } from "@/lib/northbound/write";
import {
  connectionRefusalMessage,
  resolveSapConnectionForEnvironment,
} from "@/lib/sap-public/connection-resolver";
import { resolveHubService } from "@/lib/sap-public/resolve-hub-service";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  record: z.record(z.string(), z.unknown()),
  entity: z.string().max(200).optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = newCorrelationId();

  // 1 — authenticate the read identity.
  const auth = await authenticateClientToken(extractBearer(request.headers.get("authorization")));
  if (!auth.ok) {
    console.warn("[northbound-write] auth rejected", { reason: auth.reason, correlationId });
    return unauthenticated(correlationId);
  }
  const client = auth.client;
  void touchClientLastUsed(client.clientId);

  const { id } = await ctx.params;

  const audit = (
    status: number,
    interfaceId: string | null,
    externalId: string,
    // Supplied once a connection has actually been bound. Absent on every
    // refusal that happens before that point, which is itself the truth: no
    // connection was involved.
    conn?: { id: string; environment: string | null },
  ) =>
    recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId,
      operation: "WRITE",
      externalId,
      environment: client.environment,
      status,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
      connectionId: conn?.id ?? null,
      connectionEnvironment: conn?.environment ?? null,
    });

  // 2 — the WRITE credential. A separate secret from the bearer token, so a
  // leaked read token cannot write. Sent as its own header.
  const writeSecret = request.headers.get("x-coreedge-write-key");
  const credentialOk = await verifyWriteCredential(client.scope, client.solutionId, writeSecret);
  if (!credentialOk) {
    await audit(403, id, "-");
    return northboundError(
      "FORBIDDEN",
      "A valid write credential is required for this operation.",
      403,
      correlationId,
    );
  }

  // 3 — throttle. Writes get the same per-credential bucket as reads.
  const rate = await checkRateLimit(`northbound-write:${client.clientId}`, RATE_LIMITS.northbound);
  if (!rate.allowed) {
    await audit(429, id, "-");
    return northboundError("RATE_LIMITED", "Too many requests for this client credential.", 429, correlationId, {
      "retry-after": String(Math.ceil(rate.resetMs / 1000)),
    });
  }

  // 4 — idempotency key is MANDATORY. Refusing the write outright is the only
  // honest option: without a key a retry is indistinguishable from a new intent,
  // and we would have no way to avoid duplicating a record.
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
    await audit(400, id, "-");
    return northboundError(
      "VALIDATION_ERROR",
      "An Idempotency-Key header is required for writes (8-255 chars, [A-Za-z0-9_.:-]). Reuse the same key when retrying.",
      400,
      correlationId,
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    await audit(400, id, "-");
    return northboundError("VALIDATION_ERROR", "Expected { record: object }.", 400, correlationId);
  }

  // 5 — authorize: ACTIVE write interface, owned by this solution, with a live
  // approved WRITE grant for this environment.
  const access = await resolveWritableInterface(client.scope, client.solutionId, id, client.environment);
  if (!access.ok) {
    const status =
      access.reason === "INTERFACE_NOT_FOUND" || access.reason === "NOT_THIS_SOLUTION" ? 404 : 403;
    await audit(status, id, "-");
    return northboundError(
      status === 404 ? "NOT_FOUND" : "FORBIDDEN",
      access.message,
      status,
      correlationId,
    );
  }
  const iface = access.iface;

  // 6 — reserve the key BEFORE touching SAP. A duplicate never reaches the tenant.
  const reservation = await reserveIdempotencyKey({
    scope: client.scope,
    solutionId: client.solutionId,
    interfaceId: iface.id,
    key: idempotencyKey,
    payload: parsed.data,
  });

  if (reservation.outcome === "replay") {
    // Byte-for-byte the original outcome, so a retry is indistinguishable from
    // the first call and the client's retry logic never has to branch.
    await audit(reservation.status, iface.id, iface.externalId);
    return reservation.status >= 400
      ? northboundError("CONFLICT", "Replaying the recorded outcome for this Idempotency-Key.", reservation.status, correlationId)
      : northboundOk({ ...(reservation.body as object), replayed: true }, correlationId, reservation.status);
  }

  if (reservation.outcome === "conflict") {
    const message =
      reservation.reason === "PAYLOAD_MISMATCH"
        ? "This Idempotency-Key was already used with a different payload. Use a new key for a different write."
        : "A request with this Idempotency-Key is still in progress.";
    await audit(409, iface.id, iface.externalId);
    return northboundError("CONFLICT", message, 409, correlationId);
  }

  // 7 — resolve the client's OWN connection, and check ITS write flag. A
  // connection with writeEnabled=false is a deliberate per-tenant veto that
  // overrides any grant.
  // The environment binding is STRICTER here than on the read path: a connection
  // that has not declared its landscape is refused outright, however few
  // connections the organization has. `writeEnabled` is not a substitute — it is
  // a per-connection yes/no that says nothing about WHICH landscape it enables
  // writes on, so it cannot stand in for knowing you are not in production.
  const product = getSapProduct(iface.sapProduct);
  const binding = product
    ? await resolveSapConnectionForEnvironment(
        client.organizationId,
        iface.sapProduct,
        client.environment,
        "WRITE",
      )
    : ({ ok: false, reason: "NO_CONNECTION" } as const);

  if (!binding.ok) {
    await releaseIdempotencyKey(reservation.recordId);
    await audit(403, iface.id, iface.externalId);
    return northboundError(
      "CONNECTION_NOT_CONFIGURED",
      connectionRefusalMessage(binding.reason, client.environment),
      403,
      correlationId,
    );
  }
  const connection = binding.connection;

  if (!connection.writeEnabled) {
    await releaseIdempotencyKey(reservation.recordId);
    await audit(403, iface.id, iface.externalId, connection);
    return northboundError(
      "FORBIDDEN",
      "Writes are not enabled on this SAP connection.",
      403,
      correlationId,
    );
  }

  const service = await resolveHubService(product!, iface.externalId);
  const entitySet = parsed.data.entity ?? iface.entitySet;
  if (!service || !entitySet) {
    // Released, so a client that supplies the missing entity can retry with the
    // same key rather than being told it is forever in flight.
    await releaseIdempotencyKey(reservation.recordId);
    await audit(400, iface.id, iface.externalId, connection);
    return northboundError(
      "VALIDATION_ERROR",
      service ? "No entity set configured for this interface." : "The catalogue service could not be resolved.",
      400,
      correlationId,
    );
  }

  // 8 — write.
  const result = await writeEntitySet({
    connection,
    servicePath: service.path,
    entitySet,
    payload: parsed.data.record,
  });
  const status = writeHttpStatusFor(result.status);

  const responseBody =
    status < 400
      ? { created: true, record: result.record, location: result.location, note: result.detail }
      : { error: { code: result.status, message: result.detail, correlationId } };

  // Record the outcome — including failures, so a retry replays the same refusal
  // rather than attempting the write again.
  await completeIdempotencyKey(reservation.recordId, status, responseBody);
  await audit(status, iface.id, iface.externalId, connection);

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
    return northboundError(code, result.detail, status, correlationId);
  }

  return northboundOk(
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
