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
 */

import type { NextRequest } from "next/server";

import { authenticateClientToken, extractBearer, touchClientLastUsed } from "@/lib/northbound/auth";
import { noteFailedCredential } from "@/lib/northbound/auth-failures";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import {
  newCorrelationId,
  northboundError,
  northboundOk,
  northboundThrottleRefusal,
  unauthenticated,
} from "@/lib/northbound/respond";
import { withNorthboundVersion } from "@/lib/northbound/versioned-route";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  currentResponseSchema,
  responseSchemaState,
  withheldArtifactNote,
} from "@/lib/studio/contract-provenance";
import { scopedById } from "@/lib/studio/tenant-scope";
import { standaloneSchemas } from "@/lib/contracts/json-schema";
import { toTypeName } from "@/lib/contracts/names";
import { currentRequestSchema } from "@/lib/contracts/record";
import { currentContractSnapshot } from "@/lib/contracts/snapshot";

export const dynamic = "force-dynamic";

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
      responseSchema: true,
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

  const schemaState = responseSchemaState(iface.responseSchema, iface);
  const current = await currentContractSnapshot(client.scope, iface);
  // A SAMPLED snapshot is the captured schema with a version, so it follows
  // that capture's provenance (A38): served only while the capture is of
  // THIS contract, exactly as the kit and the solution document decide. A
  // compiled one describes the dataset whatever else changed.
  const snapshot = current && (current.source === "METADATA" || schemaState === "current") ? current : null;
  const contract = snapshot
    ? {
        source: snapshot.source === "METADATA" ? ("metadata" as const) : ("sampled" as const),
        semver: snapshot.semver,
        snapshotId: snapshot.id,
        contentHash: snapshot.contentHash,
        odataVersion: snapshot.odataVersion,
        compiledAt: snapshot.createdAt.toISOString(),
        schemas: standaloneSchemas(snapshot.contract, toTypeName(snapshot.entitySet)),
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

  return northboundOk(
    {
      id: iface.id,
      name: iface.name,
      externalId: iface.externalId,
      sapProduct: iface.sapProduct,
      operation: iface.operation,
      entitySet: iface.entitySet,
      mode: iface.mode,
      version: iface.version,
      // The compiled write body, while it describes THIS contract (P1.3).
      requestSchema: currentRequestSchema(iface.requestSchema, iface),
      // Of THIS contract only, and as the served rows can satisfy it: a schema
      // captured before the broker stripped SAP's envelope still requires V2's
      // deferred navigations, which no served row carries (servedResponseSchema).
      responseSchema: currentResponseSchema(iface.responseSchema, iface),
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
    correlationId,
  );
}
