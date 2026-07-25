/**
 * POST /api/studio/interfaces — seed a governed Interface DRAFT.
 *
 * An Interface is CONFIG, not code: it records that a solution intends to consume
 * one catalogue service, at one operation. Creating it grants nothing — access is
 * decided separately through ApiAccessGrant, and runtime enforcement is a later
 * phase. This is the "Add to interface" action on Discover.
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
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";

const bodySchema = z.object({
  solutionId: z.string().min(1),
  /** Catalogue apiId of the service being consumed. */
  externalId: z.string().min(1).max(200),
  sapProduct: z.enum(["s4hana", "successfactors", "ariba"]),
  name: z.string().min(1).max(200),
  operation: z.enum(["READ", "CREATE", "UPDATE"]).default("READ"),
  entitySet: z.string().max(200).optional(),
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
