/** PUT: Update alternative | DELETE: Remove alternative */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const updateAlternativeSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  resolutionType: z.enum([
    "FIT", "CONFIGURE", "KEY_USER_EXT", "BTP_EXT",
    "ISV", "CUSTOM_ABAP", "ADAPT_PROCESS", "OUT_OF_SCOPE",
  ]).optional(),
  resolutionDescription: z.string().min(1).max(5000).optional(),
  oneTimeCost: z.number().min(0).nullable().optional(),
  recurringCost: z.number().min(0).nullable().optional(),
  costCurrency: z.string().min(3).max(3).nullable().optional(),
  implementationDays: z.number().min(0).max(999).nullable().optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  riskCategory: z.enum(["technical", "business", "compliance", "integration"]).nullable().optional(),
  upgradeStrategy: z.enum(["standard_upgrade", "needs_revalidation", "custom_maintenance"]).nullable().optional(),
  rationale: z.string().max(5000).nullable().optional(),
  pros: z.array(z.string().max(200)).max(10).optional(),
  cons: z.array(z.string().max(200)).max(10).optional(),
});

async function verifyAlternative(assessmentId: string, gapId: string, altId: string) {
  const alt = await prisma.gapAlternative.findFirst({
    where: {
      id: altId,
      gapResolutionId: gapId,
      gapResolution: { assessmentId },
    },
    select: {
      id: true,
      gapResolutionId: true,
      label: true,
      resolutionType: true,
      gapResolution: {
        select: { assessmentId: true },
      },
    },
  });

  if (!alt) {
    return null;
  }
  return alt;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; gapId: string; altId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, gapId, altId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const existing = await verifyAlternative(assessmentId, gapId, altId);
  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Alternative not found" } },
      { status: 404 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = updateAlternativeSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Build explicit update data to avoid exactOptionalPropertyTypes issues
  const updateData: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.label !== undefined) updateData.label = d.label;
  if (d.resolutionType !== undefined) updateData.resolutionType = d.resolutionType;
  if (d.resolutionDescription !== undefined) updateData.resolutionDescription = d.resolutionDescription;
  if (d.oneTimeCost !== undefined) updateData.oneTimeCost = d.oneTimeCost;
  if (d.recurringCost !== undefined) updateData.recurringCost = d.recurringCost;
  if (d.costCurrency !== undefined) updateData.costCurrency = d.costCurrency;
  if (d.implementationDays !== undefined) updateData.implementationDays = d.implementationDays;
  if (d.riskLevel !== undefined) updateData.riskLevel = d.riskLevel;
  if (d.riskCategory !== undefined) updateData.riskCategory = d.riskCategory;
  if (d.upgradeStrategy !== undefined) updateData.upgradeStrategy = d.upgradeStrategy;
  if (d.rationale !== undefined) updateData.rationale = d.rationale;
  if (d.pros !== undefined) updateData.pros = d.pros;
  if (d.cons !== undefined) updateData.cons = d.cons;

  const updated = await prisma.gapAlternative.update({
    where: { id: altId },
    data: updateData,
  });

  await logDecision({
    assessmentId,
    entityType: "gap_alternative",
    entityId: altId,
    action: "GAP_ALTERNATIVE_UPDATED",
    oldValue: { label: existing.label, resolutionType: existing.resolutionType },
    newValue: {
      label: parsed.data.label ?? existing.label,
      resolutionType: parsed.data.resolutionType ?? existing.resolutionType,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; gapId: string; altId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, gapId, altId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const existing = await verifyAlternative(assessmentId, gapId, altId);
  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Alternative not found" } },
      { status: 404 },
    );
  }

  await prisma.gapAlternative.delete({ where: { id: altId } });

  await logDecision({
    assessmentId,
    entityType: "gap_alternative",
    entityId: altId,
    action: "GAP_ALTERNATIVE_DELETED",
    oldValue: { label: existing.label, resolutionType: existing.resolutionType },
    newValue: { deleted: true },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: { deleted: true } });
}
