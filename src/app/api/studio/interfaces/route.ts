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
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";

const bodySchema = z.object({
  solutionId: z.string().min(1),
  /** Catalogue apiId of the service being consumed. */
  externalId: z.string().min(1).max(200),
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
  // `mappingVersion` is deliberately ABSENT from this schema. Mapping is v2, and
  // the surest way to keep it disabled is to give the API no way to set it —
  // a greyed-out card in the UI is a hint, an unaccepted field is a guarantee.
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
      externalId: input.externalId,
      operation: input.operation,
      ...(input.entitySet ? { entitySet: input.entitySet } : {}),
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
      requestSchema: true,
      responseSchema: true,
      solutionId: true,
      updatedAt: true,
      solution: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return studioOk({ interfaces });
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
    },
  });
  if (!current) return studioError("NOT_FOUND", "Interface not found.");

  const nextOperation = input.operation ?? (current.operation as "READ" | "CREATE" | "UPDATE");
  const nextEntitySet = input.entitySet === undefined ? current.entitySet : (input.entitySet ?? null);

  // Bump the version only when the contract actually moved. A consumer pins a
  // version; inflating it for a rename would cry wolf, and NOT inflating it for
  // an operation change would hide a breaking edit behind an unchanged number.
  const contractChanged =
    (input.operation !== undefined && input.operation !== current.operation) ||
    (input.entitySet !== undefined && nextEntitySet !== current.entitySet);

  const updated = await prisma.interface.update({
    where: { id: current.id, organizationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      operation: nextOperation,
      entitySet: nextEntitySet,
      // Mode follows the operation: a READ interface is read-mode, anything else
      // carries the stronger review. Derived, never client-supplied.
      mode: nextOperation === "READ" ? "READ" : "WRITE",
      ...(contractChanged ? { version: { increment: 1 } } : {}),
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
    },
  });

  await writeConfigAudit({
    organizationId,
    actorId: user.id,
    entityType: "Interface",
    entityId: current.id,
    action: "UPDATE",
    before: current,
    after: { ...updated, contractChanged },
  });

  return studioOk({ ...updated, contractChanged });
}
