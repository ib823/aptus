/**
 * POST /api/studio/interfaces/[id]/verify-service — check an interface's SAP
 * service, live, in one environment.
 *
 * CoreEdge fetches `{connection baseUrl}{service path}/$metadata` through the
 * organization's OWN connection for the chosen environment — the exact binding
 * the broker would use for a call from that environment, SAP client included —
 * and reports whether the answer is an OData description, which datasets it
 * declares, and whether the interface's dataset is among them.
 *
 * Works for every OData interface. For one carrying its own service path (a
 * Z* RAP service, a YY1_* custom CDS view, an ECC Gateway service) it is the
 * gate: a successful verify is recorded on the interface FOR THIS ENVIRONMENT,
 * with the connection, SAP client and host that answered, and the write route
 * refuses a custom service in an environment until that environment holds one
 * for the current contract and the binding the write uses
 * (service-verifications.ts). Verifying DEV says nothing about PROD. For a
 * catalogue interface it is information only; its runtime does not change.
 *
 * WHAT IT IS NOT. It reads no business records — the same reach as Studio's
 * connection Test, which is why no environment ceiling applies, and why it
 * takes the same tight `sapLive` bucket (isLiveSapTenantRoute). It changes no
 * grant, key or status. A failed verify never clears an earlier success (in
 * any environment): a timeout must not be able to stop live writes. Only a
 * contract change clears verification (the interfaces PATCH).
 *
 * AUDITED TWICE, like the lane re-check: a console-read row in the northbound
 * trail (dryRun, the person named, no row count — metadata is not records), and
 * a TEST_CONNECT config-audit entry, the existing verb for "someone asked us to
 * go and look", on every outcome including a refused binding.
 *
 * Every outcome is HTTP 200 with the outcome in the data, as the Test Console's
 * broker run does: the screen renders refusals as results, not as errors.
 *
 * THE CONTRACT IS COMPILED HERE (P1.3). A verify that succeeds has just read
 * the whole description, so this is where it becomes the interface's
 * recorded contract: a ContractSnapshot when the contract is new, and — for a
 * write interface — the request schema of the body it sends. Never on a
 * broker call, and never at the verify's expense: a description the compiler
 * cannot read, or a snapshot that cannot be written, is reported in
 * `contract` and the verify's verdict stands (lib/contracts/record.ts).
 */

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { reachedDirectly } from "@/lib/governed/transport";
import { newCorrelationId } from "@/lib/northbound/respond";
import {
  connectionRefusalMessage,
  resolveSapConnectionForEnvironment,
} from "@/lib/sap-public/connection-resolver";
import { recordConsoleRead } from "@/lib/sap-public/console-read-guard";
import { withServiceVerification } from "@/lib/sap-public/service-verifications";
import {
  hasCustomService,
  productAcceptsServicePath,
  resolveInterfaceService,
} from "@/lib/sap-public/interface-service";
import { isODataVersion } from "@/lib/sap-public/service-path";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { notCompiled, recordVerifiedContract, type ContractOutcome } from "@/lib/contracts/record";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { MAX_STORED_ENTITY_SETS, VERIFY_REQUEST_BUDGET_MS, verifyServiceMetadata } from "@/lib/studio/service-verify";
import { loadRecordHeads } from "@/lib/contracts/snapshot";
import { scopedById, tenantScopeFor } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";
/**
 * The compile runs in a worker thread (lib/contracts/envelope.ts), which only
 * the Node.js runtime has. Stated, not defaulted, so the envelope cannot be
 * moved to a runtime where it would not exist.
 */
export const runtime = "nodejs";
/**
 * The platform's limit for this request. The verify itself has
 * VERIFY_REQUEST_BUDGET_MS of it (service-verify.ts): the SAP read keeps its
 * own timeout, and the record job's wait for the compiler's gate and its run
 * are clamped to what is left, so the envelope, not the platform, is what
 * stops a slow compile, and the verify answers, audits and records inside
 * this limit. The rest (VERIFY_RESPONSE_MARGIN_MS) is for a worker cut at the
 * deadline to exit and for the writes below.
 */
export const maxDuration = 60;

/** Why a TWIN connection is not verified from here (wave 2 integration review round 4). */
const TWIN_NOT_VERIFIED =
  "The connection for this environment is served by the Tenant Twin, so CoreEdge does not ask the client's SAP system for this service's description through it and records no verification. Nothing was sent.";

const bodySchema = z.object({
  environment: z.enum(["SANDBOX", "DEV", "TEST", "PROD"]),
  /** The SAP client to bind to, for products that address one. */
  sapClient: z
    .string()
    .regex(/^\d{3}$/)
    .nullish(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // The verify's own deadline, from the moment the request starts (see maxDuration).
  const deadlineAt = Date.now() + VERIFY_REQUEST_BUDGET_MS;
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (!canMutateStudio(user.role)) {
    // It reaches a client's SAP system and records the result on the interface:
    // a builder action, like the connection Test.
    return studioError("FORBIDDEN", "Your role can view interfaces but not verify them.");
  }
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return studioError("FORBIDDEN", "No organization scope.");
  const scope = scoped.scope;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return studioError(
      "VALIDATION_ERROR",
      "Choose an environment (SANDBOX, DEV, TEST or PROD), and a three-digit SAP client if the system uses one.",
    );
  }
  const { environment } = parsed.data;
  const sapClient = parsed.data.sapClient ?? null;

  const { id } = await ctx.params;
  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, id),
    select: {
      id: true,
      version: true,
      sapProduct: true,
      externalId: true,
      servicePath: true,
      odataVersion: true,
      entitySet: true,
      serviceVerifications: true,
      serviceVerifiedEntitySets: true,
      operation: true,
      mode: true,
    },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  const product = getSapProduct(iface.sapProduct);
  if (!product) {
    return studioError("VALIDATION_ERROR", "This interface names an SAP product the platform does not recognise.");
  }
  if (!productAcceptsServicePath(iface.sapProduct)) {
    return studioError(
      "VALIDATION_ERROR",
      `${product.label} is not an OData product, so there is no service description to verify.`,
    );
  }

  const custom = hasCustomService(iface);
  const resolved = await resolveInterfaceService(product, iface);
  if (!resolved) {
    return studioError(
      "VALIDATION_ERROR",
      custom
        ? "This interface's own service path is not valid for its product. Fix it in Studio, then verify again."
        : "CoreEdge does not know this catalogue service's path, so it cannot be verified. If it is your own service, register it under Interfaces → Register your own API with its service path.",
    );
  }

  const correlationId = newCorrelationId();
  const serviceSource = resolved.source;

  // The runtime binding, exactly: "verified in DEV" means the connection a DEV
  // call would use answered. READ, because this is a read of a description.
  const binding = await resolveSapConnectionForEnvironment(
    scope.organizationId,
    iface.sapProduct,
    environment,
    "READ",
    sapClient,
  );

  if (!binding.ok) {
    await recordConsoleRead({
      organizationId: scope.organizationId,
      actorUserId: user.id,
      externalId: iface.externalId,
      environment,
      status: 403,
      rowCount: null,
      correlationId,
    });
    await writeConfigAudit({
      organizationId: scope.organizationId,
      actorId: user.id,
      entityType: "Interface",
      entityId: iface.id,
      action: "TEST_CONNECT",
      after: {
        event: "service_verify",
        environment,
        sapClient,
        serviceSource,
        status: "BINDING_REFUSED",
        bindingRefusal: binding.reason,
        verified: false,
        interfaceVersion: iface.version,
      },
    });
    return studioOk({
      status: "BINDING_REFUSED" as const,
      verified: false,
      detail: connectionRefusalMessage(binding.reason, environment),
      httpStatus: null,
      durationMs: 0,
      entitySets: [] as string[],
      entitySetCount: 0,
      entitySet: iface.entitySet,
      suggestedEntitySet: null,
      detectedODataVersion: null,
      serviceSource,
      boundTo: null,
      bindingRefusal: binding.reason,
      interfaceVersion: iface.version,
      contract: null,
      correlationId,
    });
  }

  const connection = binding.connection;

  /*
   * A CONNECTION SERVED BY THE TENANT TWIN IS NOT VERIFIED FROM HERE (wave 2
   * integration review round 4). This route fetches the service's $metadata
   * with the platform's own fetch and the connection's stored credentials,
   * and a TWIN connection is kept off the customer's SAP (transport.ts
   * `reachedDirectly`), as the connection Test, the sweeps, the rotation
   * probe and the console keep it. Nor is a verification recorded: the
   * write route's custom-service gate accepts the stamp, and a write through
   * the twin would then be cleared by an answer from a different system.
   * Every row is DIRECT unless P1.6 or an operator marks it TWIN, so this
   * refuses no verify that works today.
   */
  if (!reachedDirectly(connection)) {
    await recordConsoleRead({
      organizationId: scope.organizationId,
      actorUserId: user.id,
      externalId: iface.externalId,
      environment: connection.environment ?? environment,
      // The broker's answer for this binding (pipeline.ts TRANSPORT_UNAVAILABLE).
      status: 503,
      rowCount: null,
      correlationId,
      connectionId: connection.id,
      connectionEnvironment: connection.environment,
    });
    await writeConfigAudit({
      organizationId: scope.organizationId,
      actorId: user.id,
      entityType: "Interface",
      entityId: iface.id,
      action: "TEST_CONNECT",
      after: {
        event: "service_verify",
        environment,
        sapClient: connection.client,
        connectionId: connection.id,
        serviceSource,
        status: "BINDING_REFUSED",
        bindingRefusal: "TRANSPORT_UNAVAILABLE",
        reachedSap: false,
        verified: false,
        interfaceVersion: iface.version,
      },
    });
    return studioOk({
      status: "BINDING_REFUSED" as const,
      verified: false,
      detail: TWIN_NOT_VERIFIED,
      httpStatus: null,
      durationMs: 0,
      entitySets: [] as string[],
      entitySetCount: 0,
      entitySet: iface.entitySet,
      suggestedEntitySet: null,
      detectedODataVersion: null,
      serviceSource,
      boundTo: null,
      bindingRefusal: "TRANSPORT_UNAVAILABLE" as const,
      interfaceVersion: iface.version,
      // Nothing was read, so nothing was compiled (P1.3), as for any refused binding.
      contract: null,
      correlationId,
    });
  }

  const result = await verifyServiceMetadata({
    connection,
    servicePath: resolved.service.path,
    declaredVersion: isODataVersion(iface.odataVersion) ? iface.odataVersion : null,
    entitySet: iface.entitySet,
    // SuccessFactors describes one dataset at a time (service-verify.ts).
    sapProduct: iface.sapProduct,
    // The heads the dataset's contract is diffed against, read only once the record job holds its slot.
    loadHeads: () => loadRecordHeads(scope, iface, environment),
    // Its organisation's share of the fetch gate and of the compiler, so another's verifies cannot crowd it out.
    organizationId: scope.organizationId,
    // Listed when the compiler would refuse the job, so SAP is not asked (COMPILER_UNAVAILABLE).
    storedEntitySets: Array.isArray(iface.serviceVerifiedEntitySets)
      ? iface.serviceVerifiedEntitySets.filter((n): n is string => typeof n === "string")
      : null,
    deadlineAt,
  });

  await recordConsoleRead({
    organizationId: scope.organizationId,
    actorUserId: user.id,
    externalId: iface.externalId,
    environment: connection.environment ?? environment,
    status: result.auditStatus,
    // A description, not records: a row count here would bill phantom rows.
    rowCount: null,
    correlationId,
    connectionId: connection.id,
    connectionEnvironment: connection.environment,
    durationMs: result.durationMs,
    failureReason: result.failureReason,
  });

  let status: string = result.status;
  let verified = result.verified;
  if (verified) {
    /*
     * OPTIMISTIC: only the contract that was verified is marked verified. A
     * PATCH that landed while SAP was answering bumped the version (and
     * cleared verification); this write then matches nothing, and the person
     * is told to verify the new contract rather than having the old answer
     * stamped on it.
     */
    const verifiedAt = new Date();
    const entry = {
      at: verifiedAt.toISOString(),
      connectionId: connection.id,
      sapClient: connection.client ?? null,
      baseUrl: connection.baseUrl,
    };
    /*
     * PER ENVIRONMENT, MERGED WITHOUT LOSING A CONCURRENT ONE. The entry is
     * added to the environments already verified; the update is guarded on
     * the value read, so a verify of another environment that landed
     * meanwhile is re-read and kept rather than overwritten. A version change
     * ends the loop: the contract it would describe is gone.
     */
    let stored = iface.serviceVerifications ?? null;
    let recorded = false;
    /*
     * A DATABASE THAT REFUSES THE WRITE IS AN OUTCOME, NOT A 500. What is
     * written comes from SAP's answer (the dataset names); one PostgreSQL
     * cannot hold made this throw, and the verify answered 500 on every
     * attempt (hostile-input review round 3). The names are filtered before
     * they get here (service-verify.ts); whatever else refuses is reported as
     * a verify that was not recorded, and nothing is marked verified.
     */
    let writeFailed = false;
    try {
      for (let attempt = 0; attempt < 3 && !recorded; attempt++) {
        const { count } = await prisma.interface.updateMany({
          where: {
            id: iface.id,
            organizationId: scope.organizationId,
            version: iface.version,
            serviceVerifications: stored === null ? { equals: Prisma.DbNull } : { equals: stored },
          },
          data: {
            serviceVerifiedAt: verifiedAt,
            serviceVerifiedEnvironment: environment,
            serviceVerifiedEntitySets: result.entitySets.slice(0, MAX_STORED_ENTITY_SETS),
            serviceVerifications: withServiceVerification(stored, environment, entry) as unknown as Prisma.InputJsonObject,
          },
        });
        if (count > 0) {
          recorded = true;
          break;
        }
        const now = await prisma.interface.findFirst({
          where: scopedById(scope, id),
          select: { version: true, serviceVerifications: true },
        });
        if (!now || now.version !== iface.version) break;
        stored = now.serviceVerifications ?? null;
      }
    } catch (err) {
      console.error("[studio] service verification not recorded", {
        interfaceId: iface.id,
        error: err instanceof Error ? err.name : "unknown",
      });
      writeFailed = true;
    }
    if (writeFailed) {
      status = "NOT_RECORDED";
      verified = false;
    } else if (!recorded) {
      status = "CHANGED_DURING_VERIFY";
      verified = false;
    }
  }

  // Only a verified answer about THIS contract becomes its recorded contract;
  // a verify the compiler refused before SAP was asked says why, and when to retry.
  const contract: ContractOutcome | null = verified
    ? await recordVerifiedContract({
        scope,
        iface,
        compiled: result.compiled,
        heads: result.heads,
        environment,
        connectionId: connection.id,
        actorId: user.id,
      })
    : result.status === "COMPILER_UNAVAILABLE" && result.compiled && !result.compiled.ok
      ? notCompiled(result.compiled)
      : null;

  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "Interface",
    entityId: iface.id,
    action: "TEST_CONNECT",
    after: {
      event: "service_verify",
      environment,
      sapClient: connection.client,
      connectionId: connection.id,
      serviceSource,
      status,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
      verified,
      interfaceVersion: iface.version,
      entitySetCount: result.entitySetCount,
      ...(contract
        ? {
            contract:
              "semver" in contract
                ? { status: contract.status, snapshotId: contract.snapshotId, semver: contract.semver, bump: contract.bump }
                : { status: contract.status },
          }
        : {}),
    },
  });

  return studioOk({
    status,
    verified,
    detail:
      status === "CHANGED_DURING_VERIFY"
        ? "The interface changed while SAP was answering, so this result describes an older version. Verify again."
        : status === "NOT_RECORDED"
          ? "The service answered, but the verification could not be recorded, so the interface is not marked verified. Verify again."
          : result.detail,
    httpStatus: result.httpStatus,
    durationMs: result.durationMs,
    entitySets: result.entitySets,
    // Additive (structural hardening round 3): how many there are in all; `entitySets` lists the first MAX_STORED_ENTITY_SETS.
    entitySetCount: result.entitySetCount,
    entitySet: iface.entitySet,
    suggestedEntitySet: result.suggestedEntitySet,
    detectedODataVersion: result.detectedODataVersion,
    serviceSource,
    // The caller's own connection metadata — which system answered.
    boundTo: {
      key: connection.key,
      label: connection.label,
      environment: connection.environment,
      sapClient: connection.client,
      bindingUnverified: binding.bindingUnverified,
    },
    interfaceVersion: iface.version,
    // Additive (P1.3): what became of the compiled contract; null when the
    // verify did not succeed, so nothing was compiled into one.
    contract,
    correlationId,
  });
}
