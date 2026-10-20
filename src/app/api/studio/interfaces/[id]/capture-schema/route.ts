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
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { captureContractMismatch } from "@/lib/studio/contract-provenance";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { inferResponseSchema } from "@/lib/studio/schema-capture";
import { scopedById, tenantScopeFor } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Rows from a real run. Used to infer a shape, then discarded. */
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
  /**
   * The contract the run was against, as broker-run reported it. Optional so
   * a console open across the deploy keeps working (judged on the current
   * row, as before); when sent, it must still be the interface's contract.
   */
  interfaceVersion: z.number().int().min(1).optional(),
  entitySet: z.string().max(200).nullable().optional(),
});

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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Expected a non-empty array of rows.");

  const { id } = await ctx.params;
  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, id),
    select: { id: true, name: true, version: true, entitySet: true },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  const mismatch = captureContractMismatch(parsed.data, iface);
  if (mismatch) return studioError("CONFLICT", mismatch);

  const schema = inferResponseSchema(parsed.data.rows, new Date(), {
    version: iface.version,
    entitySet: iface.entitySet,
  });
  if (!schema) {
    // Rows that carried nothing describable. Better to say so than to write an
    // empty schema that looks captured.
    return studioError("VALIDATION_ERROR", "Those rows contained no describable fields.");
  }

  // Only the shape. The rows themselves are never persisted. Conditional on
  // the contract stamped: a PATCH that changed it since the read above has
  // already cleared the schema, and this must not put the old one back.
  const written = await prisma.interface.updateMany({
    where: {
      id: iface.id,
      organizationId: scope.organizationId,
      version: iface.version,
      entitySet: iface.entitySet,
    },
    data: { responseSchema: schema as never },
  });
  if (written.count === 0) {
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
      fields: Object.keys(schema.properties).length,
      sampleSize: schema["x-captured"].sampleSize,
      interfaceVersion: iface.version,
      entitySet: iface.entitySet,
    },
  });

  return studioOk({
    interfaceId: iface.id,
    fields: Object.keys(schema.properties).length,
    required: schema.required.length,
    sampleSize: schema["x-captured"].sampleSize,
  });
}
