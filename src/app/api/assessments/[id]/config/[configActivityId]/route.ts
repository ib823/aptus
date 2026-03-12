/** PUT: Toggle config activity inclusion */

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

const bodySchema = z.object({
  included: z.boolean(),
  excludeReason: z.string().optional(),
}).refine(
  (data) => data.included || (data.excludeReason && data.excludeReason.trim().length >= 10),
  { message: "Reason required (min 10 chars) when excluding a recommended config", path: ["excludeReason"] },
);
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; configActivityId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, configActivityId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user, assessment } = access;

  if (assessment.status === "signed_off" || assessment.status === "reviewed") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Assessment is locked" } },
      { status: 403 },
    );
  }

  // Verify config activity exists
  const configActivity = await prisma.configActivity.findUnique({
    where: { id: configActivityId },
    select: { id: true, category: true, configItemName: true },
  });

  if (!configActivity) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Config activity not found" } },
      { status: 404 },
    );
  }

  // Mandatory configs cannot be excluded
  if (configActivity.category === "Mandatory") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Mandatory configs cannot be excluded" } },
      { status: 400 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 },
    );
  }

  // Get existing selection for old value logging
  const existing = await prisma.configSelection.findUnique({
    where: { assessmentId_configActivityId: { assessmentId, configActivityId } },
    select: { included: true },
  });

  const selection = await prisma.configSelection.upsert({
    where: { assessmentId_configActivityId: { assessmentId, configActivityId } },
    create: {
      assessmentId,
      configActivityId,
      included: parsed.data.included,
      excludeReason: parsed.data.included ? null : (parsed.data.excludeReason ?? null),
      decidedBy: user.email,
      decidedAt: new Date(),
    },
    update: {
      included: parsed.data.included,
      excludeReason: parsed.data.included ? null : (parsed.data.excludeReason ?? null),
      decidedBy: user.email,
      decidedAt: new Date(),
    },
  });

  const defaultIncluded = configActivity.category !== "Optional";
  const oldIncluded = existing ? existing.included : defaultIncluded;

  if (oldIncluded !== parsed.data.included) {
    await logDecision({
      assessmentId,
      entityType: "config_activity",
      entityId: configActivityId,
      action: parsed.data.included ? "CONFIG_INCLUDED" : "CONFIG_EXCLUDED",
      oldValue: { included: oldIncluded },
      newValue: { included: parsed.data.included, reason: parsed.data.excludeReason },
      actor: user.email,
      actorRole: user.role,
      reason: parsed.data.excludeReason,
    });
  }

  return NextResponse.json({ data: selection });
}
