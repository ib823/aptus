/**
 * PATCH /api/assessments/[id]/requirements/[reqId]
 * Updates the editable fields on a ClientRequirement row.
 * Currently editable: solutionProviderResponse, solutionProviderRemarks, erpModuleSupporting.
 * The client-authored fields (requirementText, requirementType, etc.) are read-only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { isAssessmentAccessError, requireAssessmentAccess } from "@/lib/auth/assessment-guard";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";

const patchSchema = z
  .object({
    solutionProviderResponse: z.string().nullable().optional(),
    solutionProviderRemarks: z.string().nullable().optional(),
    erpModuleSupporting: z.string().nullable().optional(),
  })
  .refine(
    (v) =>
      v.solutionProviderResponse !== undefined ||
      v.solutionProviderRemarks !== undefined ||
      v.erpModuleSupporting !== undefined,
    { message: "At least one editable field must be provided" },
  );

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; reqId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, reqId } = await ctx.params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const existing = await prisma.clientRequirement.findUnique({
    where: { id: reqId },
    select: { id: true, assessmentId: true },
  });
  if (!existing || existing.assessmentId !== assessmentId) {
    return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  }

  // Strip undefined keys — Prisma + exactOptionalPropertyTypes doesn't accept them.
  const data: {
    solutionProviderResponse?: string | null;
    solutionProviderRemarks?: string | null;
    erpModuleSupporting?: string | null;
  } = {};
  if (parsed.data.solutionProviderResponse !== undefined) {
    data.solutionProviderResponse = parsed.data.solutionProviderResponse;
  }
  if (parsed.data.solutionProviderRemarks !== undefined) {
    data.solutionProviderRemarks = parsed.data.solutionProviderRemarks;
  }
  if (parsed.data.erpModuleSupporting !== undefined) {
    data.erpModuleSupporting = parsed.data.erpModuleSupporting;
  }

  const updated = await prisma.clientRequirement.update({
    where: { id: reqId },
    data,
    select: {
      id: true,
      solutionProviderResponse: true,
      solutionProviderRemarks: true,
      erpModuleSupporting: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, requirement: updated });
}
