/**
 * /api/studio/interfaces — governed interface config.
 *
 *   GET   list this organization's interfaces
 *   POST  seed a DRAFT (the "Add to interface" action on Discover)
 *   PATCH edit, with a version bump when the CONTRACT changes
 *
 * An Interface is CONFIG, not code: it records that a solution intends to consume
 * one catalogue service, at one operation. Creating it grants nothing — access is
 * decided separately through ApiAccessGrant, and runtime enforcement is a later
 * phase.
 *
 * Guards, in order:
 *   1. authenticated
 *   2. builder role (an admin's Studio access is oversight, not authorship)
 *   3. has a tenant to scope to
 *   4. body validates
 *   5. THE PARENT SOLUTION BELONGS TO THE CALLER'S ORGANIZATION — the guard that
 *      matters. `solutionId` is attacker-supplied, so it is re-scoped to the
 *      caller's org rather than trusted; a solution in another tenant is
 *      indistinguishable from one that does not exist (both 404).
 *
 * v1: `mappingVersion` is always null (the mapping engine is v2) and `status` is
 * always DRAFT — an interface never springs into existence already active.
 *
 * YOUR OWN API. An interface may carry its own OData `servicePath` (a Z* RAP
 * service, a YY1_* custom CDS view, an ECC Gateway service) with its
 * `odataVersion`, instead of naming a catalogue service. Its `externalId` is
 * then DERIVED — `custom:<path>` — never typed, so a grant approved for one
 * path can never authorise another. An interface is catalogue or custom for
 * life: converting between them is refused, because the grants, keys and
 * history of one say nothing about the other.
 */

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { idsWithRequestSchema } from "@/lib/contracts/record";
import { recordJourneyEvent } from "@/lib/coreedge/journey";
import { prisma } from "@/lib/db/prisma";
import { productAcceptsServicePath } from "@/lib/sap-public/interface-service";
import {
  customExternalId,
  isCustomExternalId,
  MAX_SERVICE_PATH_LENGTH,
  ODATA_VERSIONS,
  validateServicePath,
} from "@/lib/sap-public/service-path";
import {
  loadCurrentConnections,
  verifiedEnvironmentsForCredentials,
  writesDisabledEnvironmentsForCredentials,
} from "@/lib/sap-public/current-connections";
import { verifiedEnvironmentsForDisplay } from "@/lib/sap-public/service-verifications";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { responseSchemaStates } from "@/lib/studio/response-schema-states";
import { grantsForInterfaceWhere, grantsUsableUnder } from "@/lib/studio/grant-binding";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import {
  readyEnvironments,
  UPDATE_NOT_EXECUTABLE,
  writeReadinessByEnvironment,
  writeReadinessRefusal,
} from "@/lib/studio/write-readiness";

const bodySchema = z.object({
  solutionId: z.string().min(1),
  /**
   * Catalogue apiId of the service being consumed. Omitted for your own API:
   * there it is derived from `servicePath` (see the header).
   */
  externalId: z.string().min(1).max(200).optional(),
  /**
   * The customer's OWN service root, a path on the connection's host. Bounded
   * one past the limit here so an over-long path reaches validateServicePath
   * and gets its own sentence rather than the generic payload refusal.
   */
  servicePath: z.string().max(MAX_SERVICE_PATH_LENGTH + 1).optional(),
  odataVersion: z.enum(ODATA_VERSIONS).optional(),
  /*
   * EVERY PRODUCT THE CONNECTOR KNOWS, not a hand-kept three. The literal enum
   * ["s4hana","successfactors","ariba"] predated the private-cloud/on-prem/ECC
   * products and was never widened — so the three client-addressing products
   * could be CONNECTED but no interface (and therefore no grant, credential,
   * scaffold or broker call) could ever be defined against them: "Add to
   * interface" on a RISE tenant 400'd with no field-level detail. Validated
   * against getSapProduct so this list and the product registry cannot drift
   * apart again.
   */
  sapProduct: z.string().min(1).refine((k) => getSapProduct(k) !== null, {
    message: "Unknown SAP product",
  }),
  name: z.string().min(1).max(200),
  operation: z.enum(["READ", "CREATE", "UPDATE"]).default("READ"),
  entitySet: z.string().max(200).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  operation: z.enum(["READ", "CREATE", "UPDATE"]).optional(),
  entitySet: z.string().max(200).nullish(),
  status: z.enum(["DRAFT", "ACTIVE", "DEPRECATED"]).optional(),
  /** Your own API only — see the header. Null is refused, not a way to convert. */
  servicePath: z.string().max(MAX_SERVICE_PATH_LENGTH + 1).nullish(),
  odataVersion: z.enum(ODATA_VERSIONS).nullish(),
  // `mappingVersion` is deliberately ABSENT from this schema. Mapping is v2, and
  // the surest way to keep it disabled is to give the API no way to set it —
  // a greyed-out card in the UI is a hint, an unaccepted field is a guarantee.
  // So are the query policy's columns (P1.4): the query-policy route, which
  // compiles a source against the basis under the row lock, is their only
  // writer, and a policy edit never bumps the version.
});


export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) {
    return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  }
  if (!canMutateStudio(user.role)) {
    return studioError("FORBIDDEN", "Your role can view Studio but not author interfaces.");
  }
  if (lacksStudioTenantScope(user)) {
    return studioError("FORBIDDEN", "No organization scope.");
  }

  const organizationId = user.organizationId;
  if (!organizationId) {
    // Unreachable for a builder (lacksStudioTenantScope covers it) — belt and
    // braces so the query below can never run without a tenant.
    return studioError("FORBIDDEN", "No organization scope.");
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return studioError("VALIDATION_ERROR", "Invalid interface payload.");
  }
  const input = parsed.data;

  /*
   * CATALOGUE OR YOUR OWN API — decided here, before anything is looked up.
   * With a service path the id is derived and the version is required; without
   * one the request is the catalogue request it always was, and the derived
   * prefix is reserved so a catalogue interface can never pose as a custom one.
   */
  let externalId: string;
  let servicePath: string | null = null;
  let odataVersion: (typeof ODATA_VERSIONS)[number] | null = null;
  if (input.servicePath !== undefined) {
    if (!productAcceptsServicePath(input.sapProduct)) {
      const label = getSapProduct(input.sapProduct)?.label ?? input.sapProduct;
      return studioError("VALIDATION_ERROR", `${label} is not an OData product, so it has no service path.`);
    }
    const check = validateServicePath(input.servicePath);
    if (!check.ok) return studioError("VALIDATION_ERROR", check.message);
    if (input.odataVersion === undefined) {
      return studioError("VALIDATION_ERROR", "Choose the OData version of this service (V2 or V4).");
    }
    const derived = customExternalId(check.path);
    if (input.externalId !== undefined && input.externalId !== derived) {
      return studioError(
        "VALIDATION_ERROR",
        "For your own API the id is derived from the service path, so leave externalId out.",
      );
    }
    externalId = derived;
    servicePath = check.path;
    odataVersion = input.odataVersion;
  } else {
    if (input.odataVersion !== undefined) {
      return studioError(
        "VALIDATION_ERROR",
        "An OData version belongs to your own service path. Send servicePath with it, or leave both out for a catalogue service.",
      );
    }
    if (input.externalId === undefined) {
      return studioError("VALIDATION_ERROR", "Invalid interface payload.");
    }
    if (isCustomExternalId(input.externalId)) {
      return studioError(
        "VALIDATION_ERROR",
        "Ids starting with custom: are reserved for your own APIs. Send servicePath and odataVersion instead.",
      );
    }
    externalId = input.externalId;
  }

  // Re-scope the attacker-supplied solutionId to this tenant. Never trust it.
  const solution = await prisma.solution.findFirst({
    where: { id: input.solutionId, organizationId },
    select: { id: true, name: true },
  });
  if (!solution) return studioError("NOT_FOUND", "Solution not found.");

  const created = await prisma.interface.create({
    data: {
      solutionId: solution.id,
      organizationId,
      name: input.name,
      sapProduct: input.sapProduct,
      externalId,
      operation: input.operation,
      ...(input.entitySet ? { entitySet: input.entitySet } : {}),
      // Both or neither — the invariant the resolver relies on.
      ...(servicePath !== null ? { servicePath, odataVersion } : {}),
      // READ operations are read-mode; CREATE/UPDATE imply the stronger review path.
      mode: input.operation === "READ" ? "READ" : "WRITE",
      status: "DRAFT",
      // mappingVersion is intentionally left null — mapping is v2.
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
    },
  });

  await writeConfigAudit({
    organizationId,
    actorId: user.id,
    entityType: "Interface",
    entityId: created.id,
    action: "CREATE",
    after: created,
  });

  // The app's first interface is a journey milestone (P2.12); later ones are
  // no-ops. Never fails the registration.
  await recordJourneyEvent({
    organizationId,
    kind: "INTERFACE_REGISTERED",
    solutionId: solution.id,
    subjectId: created.id,
    actorUserId: user.id,
  });

  return studioOk(created, 201);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const organizationId = user.organizationId;
  if (!organizationId) return studioOk({ interfaces: [] });

  const solutionId = request.nextUrl.searchParams.get("solutionId");

  const interfaces = await prisma.interface.findMany({
    where: {
      organizationId,
      // A caller-supplied filter is fine here BECAUSE organizationId is already
      // pinned above: narrowing within your own tenant cannot cross a boundary.
      ...(solutionId ? { solutionId } : {}),
    },
    select: {
      id: true,
      name: true,
      version: true,
      sapProduct: true,
      externalId: true,
      operation: true,
      entitySet: true,
      mode: true,
      status: true,
      mappingVersion: true,
      // Neither stored schema: an org-wide list says whether there is a
      // requestSchema, and where the responseSchema stands, each by a query
      // that never reads the column (below), so the list's work is bounded
      // by its small columns whatever was stored (hostile-input review round
      // 2; P1.3 structural containment).
      solutionId: true,
      updatedAt: true,
      servicePath: true,
      odataVersion: true,
      serviceVerifiedAt: true,
      serviceVerifiedEnvironment: true,
      serviceVerifications: true,
      solution: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  // Per-binding verification, for display: environment, when, client, and
  // whether the connection that answered has changed since — never the
  // connection id or host the gate compares against. Connections are read
  // only when some interface carries a verification.
  const anyVerified = interfaces.some((i) => i.serviceVerifications != null);
  const [connections, withRequestSchema, schemaStates] = await Promise.all([
    anyVerified ? loadCurrentConnections(organizationId) : Promise.resolve([] as Awaited<ReturnType<typeof loadCurrentConnections>>),
    idsWithRequestSchema({ organizationId, ...(solutionId ? { solutionId } : {}) }),
    responseSchemaStates(organizationId, interfaces, solutionId),
  ]);
  return studioOk({
    interfaces: interfaces.map(({ serviceVerifications, ...rest }) => ({
      ...rest,
      // Whether a write body is recorded for it; GET …/schema serves the body.
      hasRequestSchema: withRequestSchema.has(rest.id),
      // Whether the stored schema is THIS contract's (contract-provenance.ts, A38),
      // read from the schema's stamp in the database, never the schema itself.
      responseSchemaState: schemaStates.get(rest.id) ?? "none",
      serviceVerifiedEnvironments: verifiedEnvironmentsForDisplay(
        serviceVerifications,
        connections.filter((c) => c.product === rest.sapProduct),
      ),
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) {
    return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  }
  if (!canMutateStudio(user.role)) {
    return studioError("FORBIDDEN", "Your role can view interfaces but not author them.");
  }
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const organizationId = user.organizationId;
  if (!organizationId) return studioError("FORBIDDEN", "No organization scope.");

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid interface payload.");
  const input = parsed.data;

  // Re-scope the caller-supplied id to this tenant.
  const current = await prisma.interface.findFirst({
    where: { id: input.id, organizationId },
    select: {
      id: true,
      name: true,
      version: true,
      operation: true,
      entitySet: true,
      mode: true,
      status: true,
      mappingVersion: true,
      solutionId: true,
      externalId: true,
      sapProduct: true,
      servicePath: true,
      odataVersion: true,
      serviceVerifiedAt: true,
      serviceVerifications: true,
      // Judged against an unbound grant's legacy cut-off (grant-binding.ts).
      createdAt: true,
      grantMatchChangedAt: true,
    },
  });
  if (!current) return studioError("NOT_FOUND", "Interface not found.");

  const nextOperation = input.operation ?? (current.operation as "READ" | "CREATE" | "UPDATE");
  const nextEntitySet = input.entitySet === undefined ? current.entitySet : (input.entitySet ?? null);
  const nextMode = nextOperation === "READ" ? "READ" : "WRITE";

  /*
   * YOUR OWN API: THE SERVICE IS PART OF THE CONTRACT.
   *
   * An interface is catalogue or custom for life. Setting a path on a
   * catalogue interface, or clearing it on a custom one, would carry the
   * other kind's grants, keys and history across — refused, with the way
   * forward named.
   */
  const isCustom = current.servicePath != null;
  const touchesService = input.servicePath !== undefined || input.odataVersion !== undefined;
  if (touchesService && !isCustom) {
    return studioError(
      "VALIDATION_ERROR",
      "This interface uses a catalogue service. To call your own API, register a new interface with its service path.",
    );
  }
  if (isCustom && (input.servicePath === null || input.odataVersion === null)) {
    return studioError(
      "VALIDATION_ERROR",
      "Your own API needs a service path and an OData version; they cannot be cleared. Deprecate the interface instead.",
    );
  }
  let nextServicePath = current.servicePath;
  if (isCustom && typeof input.servicePath === "string") {
    const check = validateServicePath(input.servicePath);
    if (!check.ok) return studioError("VALIDATION_ERROR", check.message);
    nextServicePath = check.path;
  }
  const nextOdataVersion = (isCustom && input.odataVersion) || current.odataVersion;
  const serviceChanged =
    isCustom && (nextServicePath !== current.servicePath || nextOdataVersion !== current.odataVersion);
  // A new path is a new grant identity: grants name `custom:<path>`, so the
  // old ones detach and a second person approves the new path afresh.
  const nextExternalId =
    serviceChanged && nextServicePath !== null ? customExternalId(nextServicePath) : current.externalId;
  const entitySetChanged = input.entitySet !== undefined && nextEntitySet !== current.entitySet;
  /*
   * VERIFICATION DESCRIBES A CONTRACT. Any change to what is called — path,
   * version, dataset — makes the last verify an answer to a different
   * question, so it is cleared, and the write route refuses a custom service
   * until it is verified again.
   */
  const verificationReset = serviceChanged || entitySetChanged;

  // Bump the version only when the contract actually moved. A consumer pins a
  // version; inflating it for a rename would cry wolf, and NOT inflating it for
  // an operation change would hide a breaking edit behind an unchanged number.
  const contractChanged =
    (input.operation !== undefined && input.operation !== current.operation) ||
    (input.entitySet !== undefined && nextEntitySet !== current.entitySet) ||
    serviceChanged;

  /*
   * A NEW GRANT TUPLE IS A NEW INTERFACE, TO A LEGACY GRANT (wave 1a final
   * review). A grant is matched on (externalId, operation); an unbound legacy
   * grant is honoured only on an interface that matched it by the P0.1
   * deploy. That was judged on `createdAt`, so moving an interface created
   * before the deploy onto an unbound grant's tuple — CREATE to READ, or your
   * own API to a path an unbound grant names — reached that grant at once, on
   * a product nobody approved it for. The change is stamped, and the cut-off
   * is judged on the later of the two (grant-binding.ts, `grantMatchSince`).
   * The dataset is not part of the tuple, so changing it stamps nothing.
   */
  const grantMatchChanged = nextOperation !== current.operation || nextExternalId !== current.externalId;

  /*
   * AN ACTIVE WRITE INTERFACE WHOSE CONTRACT WAS UNVERIFIED GOES BACK TO
   * DRAFT. A new path, version or dataset on your own API clears
   * verification, and the write route refuses an unverified custom service;
   * leaving it ACTIVE would keep it looking live while every write is
   * refused. One rule for all three edits. A READ interface stays ACTIVE —
   * reads are not gated on verification; on a path change its grants detach
   * (the id changed), so calls answer 403 until a new grant is approved,
   * which is the governance outcome intended, and Studio says so before the
   * save.
   */
  const unverifiedWriteContract = isCustom && nextMode === "WRITE" && verificationReset;
  const demoted = unverifiedWriteContract && current.status === "ACTIVE";
  const nextStatus = input.status ?? (demoted ? "DRAFT" : undefined);

  /*
   * EVERY ROUTE TO ACTIVE PASSES THE GATES (P0.1, A46). They used to run only
   * on the status transition, so an interface could be activated as a READ
   * with an entity set and then, already ACTIVE, be switched to CREATE or
   * UPDATE or have its entity set cleared — reaching an ACTIVE write with no
   * check, recorded as an ordinary UPDATE. A contract change to an interface
   * that STAYS active is a promotion of a new contract: it runs every gate
   * below and is audited as PROMOTE. The product is not editable here (the
   * schema strips it), and the version follows the contract.
   */
  const promoting = input.status === "ACTIVE" && current.status !== "ACTIVE";
  const willBeActive = (nextStatus ?? current.status) === "ACTIVE";
  const repromoting = willBeActive && current.status === "ACTIVE" && contractChanged;
  const gated = promoting || repromoting;

  /*
   * ACTIVE IS LOAD-BEARING, SO PROMOTION HAS PRECONDITIONS.
   *
   * `status: ACTIVE` is the single precondition the write path checks
   * (resolveWritableInterface) — and this handler used to apply it
   * unconditionally, making it the only load-bearing gate in the product with
   * no check of any kind. Two now apply:
   *
   *   1. An entity set must be configured. The broker refuses a call on an
   *      interface with none ("This interface has no entity set configured"),
   *      so promoting without one manufactures an ACTIVE interface whose every
   *      call fails — the client component even documents the refusal thirty
   *      lines from the button that caused it.
   *   2. The promotion is audited as PROMOTE with the promoter named — the
   *      second-person review lives in the grant decision (a write still needs
   *      an approved grant from someone other than the requester), so the
   *      audit record rather than a second approver is the proportionate
   *      control here.
   */
  if (gated && nextEntitySet === null) {
    return studioError(
      "VALIDATION_ERROR",
      "An interface cannot be activated without an entity set — the broker refuses every call on one. Set the entity set first.",
    );
  }

  /*
   *   3. UPDATE cannot be activated at all yet. The broker refuses it on every
   *      call (OPERATION_NOT_SUPPORTED): its executor only creates, and sending
   *      an update as a create would add a record instead of changing one.
   *      Checked before the write chain, because no grant or key fixes it.
   */
  if (gated && nextOperation === "UPDATE") {
    return studioError("VALIDATION_ERROR", UPDATE_NOT_EXECUTABLE);
  }

  /*
   *   3b. Your own API changes and activates in TWO steps, never one: a new
   *      service is unverified by definition, so "save and go live" would be
   *      a live interface nobody has looked at. The same holds for a WRITE
   *      interface's dataset: a new dataset is unverified too, and the write
   *      route refuses it until it is verified again.
   */
  if ((serviceChanged || unverifiedWriteContract) && input.status === "ACTIVE") {
    return studioError(
      "VALIDATION_ERROR",
      serviceChanged
        ? "Change the service and activate in two steps: save it, verify it, then activate."
        : "Change the dataset and activate in two steps: save it, verify it, then activate.",
    );
  }

  /*
   *   3c. A WRITE interface on your own API is activated only once its service
   *      has been verified, for the contract being activated. The write route
   *      refuses an unverified custom service on every call; activating one
   *      would be building toward that wall.
   */
  if (
    gated &&
    isCustom &&
    nextMode === "WRITE" &&
    (verificationReset || current.serviceVerifiedAt == null)
  ) {
    return studioError(
      "VALIDATION_ERROR",
      "Verify this interface's own SAP service before activating a write interface. The broker refuses writes in an environment until the service has been verified there, through that environment's connection.",
    );
  }

  /*
   *   4. A WRITE interface needs the FULL write chain in SOME environment
   *      before it is ACTIVE. A write reaches SAP only when, in one
   *      environment, a live credential carries a write key AND a live
   *      approved write grant covers this capability (the broker checks both
   *      at call time). The interim gate checked only "some credential of the
   *      solution carries a write key", so a DEV write key beside a PROD-only
   *      grant activated an interface no environment could call — the
   *      developer built toward a wall with the gate's blessing. The order is
   *      enforced where the developer is standing, per environment: write
   *      grant approved for E → write credential issued for E → ACTIVE.
   *      Checked on PROMOTION — of the status, or of a new contract on an
   *      interface that stays ACTIVE (A46) — like the entity set: an
   *      interface already ACTIVE is not demoted by a later revocation — the
   *      broker refuses that call itself.
   *
   *      For YOUR OWN API the same environment must ALSO hold a verification
   *      that still matches its connection: the write route refuses a custom
   *      service in any environment it has not been verified in (3c only
   *      asks "verified somewhere"), so "verified in SANDBOX, chain complete
   *      in PROD" is another wall (review round 2).
   */
  if (gated && nextOperation !== "READ") {
    const now = new Date();
    const grantedAs = {
      id: current.id,
      externalId: nextExternalId,
      operation: nextOperation,
      sapProduct: current.sapProduct,
      createdAt: current.createdAt,
      // The contract being promoted matches from this PATCH on, if it moves.
      grantMatchChangedAt: grantMatchChanged ? now : current.grantMatchChangedAt,
    };
    const [liveCredentials, writeKeyHolders, grants, connections] = await Promise.all([
      prisma.solutionClient.findMany({
        where: { organizationId, solutionId: current.solutionId, isActive: true, revokedAt: null },
        // sapClient: a write binds by environment AND the credential's client,
        // so readiness must select the same connection the write would.
        select: { id: true, environment: true, expiresAt: true, sapClient: true },
      }),
      // Which of them carry a write key — a filter on the sealed column,
      // selecting the id only; the value is never read. By id, not by
      // environment: the credential that writes is the one whose binding
      // must be verified (review round 4).
      prisma.solutionClient.findMany({
        where: {
          organizationId,
          solutionId: current.solutionId,
          isActive: true,
          revokedAt: null,
          NOT: { secretsCiphertext: null },
        },
        select: { id: true },
      }),
      // The grants that would authorise THIS interface's writes: bound to it on
      // its product, or (legacy) unbound — the broker's own match (P0.1).
      prisma.apiAccessGrant.findMany({
        where: {
          organizationId,
          solutionId: current.solutionId,
          ...grantsForInterfaceWhere(grantedAs),
        },
        select: {
          environment: true,
          decision: true,
          expiresAt: true,
          revokedAt: true,
          interfaceId: true,
          sapProduct: true,
          createdAt: true,
          unboundCutoffAt: true,
        },
      }),
      isCustom ? loadCurrentConnections(organizationId, current.sapProduct) : Promise.resolve(null),
    ]);
    const withWriteKey = new Set(writeKeyHolders.map((c) => c.id));
    const unexpired = liveCredentials.filter((c) => c.expiresAt === null || c.expiresAt.getTime() > now.getTime());
    // Every live credential, with its write key: the binding is judged
    // whether or not the key is sealed yet, because it is sealed onto that
    // same row (review round 5); where a write-key holder exists, only its
    // binding decides (review round 4).
    const readinessCredentials = unexpired.map((c) => ({
      environment: c.environment,
      sapClient: c.sapClient ?? null,
      hasWriteKey: withWriteKey.has(c.id),
    }));
    const readiness = writeReadinessByEnvironment({
      credentials: readinessCredentials,
      grants: grantsUsableUnder(grants, grantedAs),
      // A contract this request changes is verified nowhere (3b refuses it anyway).
      // Otherwise verified only where a live credential's own binding —
      // environment AND its SAP client — holds the verification (round 3).
      serviceVerifiedEnvironments: connections
        ? verificationReset
          ? []
          : verifiedEnvironmentsForCredentials(current.serviceVerifications, connections, readinessCredentials)
        : null,
      // …and where that binding's connection has writes switched on: the
      // write route refuses every write through one that has not (round 5).
      writesDisabledEnvironments: connections
        ? writesDisabledEnvironmentsForCredentials(connections, readinessCredentials)
        : null,
      now,
    });
    if (readyEnvironments(readiness).length === 0) {
      return studioError("VALIDATION_ERROR", writeReadinessRefusal(nextOperation, readiness));
    }
  }

  /*
   * A COMPARE-AND-SET ON WHAT THE GATES JUDGED (A46, review round 1). The
   * gates above ran on `current`, read with no lock; the write used to be
   * unconditional. So PATCH {status: ACTIVE} and PATCH {operation: CREATE}
   * sent together both read DRAFT/READ: the first passed as a READ promotion,
   * the second was not gated at all (not ACTIVE, not becoming ACTIVE), and
   * the two writes merged into an ACTIVE write interface no write gate had
   * seen, under a PROMOTE row describing a READ. Every field a gate reads is
   * now in the WHERE, so a PATCH that lands second finds the row changed,
   * writes nothing and answers 409; the caller re-reads, and its retry is
   * judged on what the first one wrote.
   */
  /*
   * A NEW CONTRACT INVALIDATES WHAT WAS CAPTURED FROM THE OLD ONE (P0.4, A38).
   * The version was bumped and the captured response schema and mock
   * fixtures were left alone, so /schema served the new entity set with the
   * old shape and the kit's mock served the old entity set's rows. They are
   * cleared in the same transaction as the bump, and the audit says what went.
   * Readers also check each capture's stamp (contract-provenance.ts), so a
   * capture that races this one is never served either.
   */
  let updated;
  let fixturesCleared = 0;
  let schemaCleared = false;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.interface.update({
        where: {
          id: current.id,
          organizationId,
          status: current.status,
          operation: current.operation,
          entitySet: current.entitySet,
          externalId: current.externalId,
          servicePath: current.servicePath,
          odataVersion: current.odataVersion,
          version: current.version,
        },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(nextStatus !== undefined ? { status: nextStatus } : {}),
          operation: nextOperation,
          entitySet: nextEntitySet,
          // Mode follows the operation: a READ interface is read-mode, anything else
          // carries the stronger review. Derived, never client-supplied.
          mode: nextMode,
          // A new contract: the request schema stamp written for the old one
          // goes (P1.3), as the captured response schema does below. Verify
          // writes it again for the new one. So do the query basis and the
          // compiled query policy (P1.4): both describe the old contract, and
          // a policy compiled against it must not serve the new one. The
          // builder's source stays; queries answer QUERY_NOT_AVAILABLE
          // (NO_CONTRACT) until the next verify compiles it again.
          ...(contractChanged
            ? { version: { increment: 1 }, requestSchemaStamp: Prisma.DbNull, queryBasis: Prisma.DbNull, queryPolicyCompiled: Prisma.DbNull }
            : {}),
          ...(grantMatchChanged ? { grantMatchChangedAt: new Date() } : {}),
          ...(serviceChanged
            ? { servicePath: nextServicePath, odataVersion: nextOdataVersion, externalId: nextExternalId }
            : {}),
          ...(verificationReset
            ? {
                serviceVerifiedAt: null,
                serviceVerifiedEnvironment: null,
                serviceVerifiedEntitySets: Prisma.DbNull,
                serviceVerifications: Prisma.DbNull,
              }
            : {}),
          // mappingVersion is never written here — see patchSchema.
        },
        select: {
          id: true,
          name: true,
          version: true,
          operation: true,
          entitySet: true,
          mode: true,
          status: true,
          mappingVersion: true,
          externalId: true,
          servicePath: true,
          odataVersion: true,
          serviceVerifiedAt: true,
        },
      });
      if (contractChanged) {
        const cleared = await tx.interface.updateMany({
          where: { id: current.id, organizationId, responseSchema: { not: Prisma.DbNull } },
          data: { responseSchema: Prisma.DbNull },
        });
        schemaCleared = cleared.count > 0;
        const removed = await tx.mockFixture.deleteMany({ where: { organizationId, interfaceId: current.id } });
        fixturesCleared = removed.count;
      }
      return saved;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return studioError(
        "CONFLICT",
        "This interface was changed by someone else while you were saving. Reload it and make your change again.",
      );
    }
    throw err;
  }

  await writeConfigAudit({
    organizationId,
    actorId: user.id,
    entityType: "Interface",
    entityId: current.id,
    // A promotion to ACTIVE is the load-bearing act (it is the write path's
    // precondition) and gets the PROMOTE verb — and so does a new contract on
    // an interface that stays ACTIVE (A46). Everything else is an edit.
    action: gated ? "PROMOTE" : "UPDATE",
    before: current,
    after: {
      ...updated,
      contractChanged,
      serviceChanged,
      verificationReset,
      demoted,
      repromoted: repromoting,
      schemaCleared,
      fixturesCleared,
    },
  });

  return studioOk({
    ...updated,
    contractChanged,
    serviceChanged,
    verificationReset,
    demoted,
    repromoted: repromoting,
    schemaCleared,
    fixturesCleared,
  });
}
