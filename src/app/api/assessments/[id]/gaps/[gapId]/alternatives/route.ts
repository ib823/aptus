/** GET: List alternatives for a gap resolution */
/** POST: Create a new alternative for a gap resolution */

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

const alternativeSchema = z.object({
  label: z.string().min(1).max(200),
  resolutionType: z.enum([
    "FIT", "CONFIGURE", "KEY_USER_EXT", "BTP_EXT",
    "ISV", "CUSTOM_ABAP", "ADAPT_PROCESS", "OUT_OF_SCOPE",
  ]),
  resolutionDescription: z.string().min(10).max(5000),
  oneTimeCost: z.number().min(0).nullable().optional(),
  recurringCost: z.number().min(0).nullable().optional(),
  costCurrency: z.string().min(3).max(3).nullable().optional(),
  implementationDays: z.number().min(0).nullable().optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  riskCategory: z.enum(["technical", "business", "compliance", "integration"]).nullable().optional(),
  upgradeStrategy: z.enum(["standard_upgrade", "needs_revalidation", "custom_maintenance"]).nullable().optional(),
  rationale: z.string().max(5000).nullable().optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
});
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; gapId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, gapId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }

  const alternatives = await prisma.gapAlternative.findMany({
    where: {
      gapResolutionId: gapId,
      gapResolution: { assessmentId },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ data: alternatives });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; gapId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, gapId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = alternativeSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Verify gap exists
  const gap = await prisma.gapResolution.findFirst({
    where: { id: gapId, assessmentId },
    select: { assessmentId: true },
  });

  if (!gap) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Gap resolution not found" } },
      { status: 404 },
    );
  }

  const alternative = await prisma.gapAlternative.create({
    data: {
      gapResolutionId: gapId,
      label: parsed.data.label,
      resolutionType: parsed.data.resolutionType,
      resolutionDescription: parsed.data.resolutionDescription,
      oneTimeCost: parsed.data.oneTimeCost ?? null,
      recurringCost: parsed.data.recurringCost ?? null,
      costCurrency: parsed.data.costCurrency ?? null,
      implementationDays: parsed.data.implementationDays ?? null,
      riskLevel: parsed.data.riskLevel ?? null,
      riskCategory: parsed.data.riskCategory ?? null,
      upgradeStrategy: parsed.data.upgradeStrategy ?? null,
      rationale: parsed.data.rationale ?? null,
      pros: parsed.data.pros ?? [],
      cons: parsed.data.cons ?? [],
      createdBy: user.email,
    },
  });

  await logDecision({
    assessmentId,
    entityType: "gap_alternative",
    entityId: alternative.id,
    action: "GAP_ALTERNATIVE_ADDED",
    newValue: {
      gapId,
      label: parsed.data.label,
      resolutionType: parsed.data.resolutionType,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: alternative }, { status: 201 });
}
