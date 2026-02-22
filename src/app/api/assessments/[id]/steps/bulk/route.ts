/** POST: Bulk mark steps as FIT or NA */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, canEditStepResponse } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const bulkSchema = z.object({
  scopeItemId: z.string(),
  fitStatus: z.enum(["FIT", "NA"]),
  stepIds: z.array(z.string()).min(1).max(5000).optional(),
  excludeStepTypes: z.array(
    z.enum([
      "LOGON", "ACCESS_APP", "INFORMATION", "DATA_ENTRY",
      "ACTION", "VERIFICATION", "NAVIGATION", "PROCESS_STEP",
    ]),
  ).optional(),
});

export const preferredRegion = "sin1";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;

  const body: unknown = await request.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  // Check scope item exists and get functional area
  const scopeItem = await prisma.scopeItem.findUnique({
    where: { id: parsed.data.scopeItemId },
    select: { functionalArea: true },
  });

  if (!scopeItem) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Scope item not found" } },
      { status: 404 },
    );
  }

  // Check permissions
  const permCheck = await canEditStepResponse(user, assessmentId, scopeItem.functionalArea);
  if (!permCheck.allowed) {
    return NextResponse.json(
      { error: { code: permCheck.code ?? ERROR_CODES.FORBIDDEN, message: permCheck.message ?? "Forbidden" } },
      { status: 403 },
    );
  }

  // Get target steps
  const stepWhere: Record<string, unknown> = {
    scopeItemId: parsed.data.scopeItemId,
  };
  if (parsed.data.stepIds) {
    stepWhere.id = { in: parsed.data.stepIds };
  }
  if (parsed.data.excludeStepTypes && parsed.data.excludeStepTypes.length > 0) {
    stepWhere.stepType = { notIn: parsed.data.excludeStepTypes };
  }

  const steps = await prisma.processStep.findMany({
    where: stepWhere,
    select: { id: true },
  });

  // Get existing responses
  const existingResponses = await prisma.stepResponse.findMany({
    where: {
      assessmentId,
      processStepId: { in: steps.map((s) => s.id) },
    },
    select: { processStepId: true, fitStatus: true },
  });

  const existingMap = new Map(existingResponses.map((r) => [r.processStepId, r.fitStatus]));

  let updated = 0;
  let created = 0;
  let skipped = 0;

  // Only target steps that don't already have a non-PENDING response (unless overriding)
  const operations = [];
  for (const step of steps) {
    const existing = existingMap.get(step.id);
    if (existing === parsed.data.fitStatus) {
      skipped++;
      continue;
    }

    if (existing && existing !== "PENDING") {
      // Already has a real response, skip
      skipped++;
      continue;
    }

    operations.push(
      prisma.stepResponse.upsert({
        where: {
          assessmentId_processStepId: { assessmentId, processStepId: step.id },
        },
        update: {
          fitStatus: parsed.data.fitStatus,
          respondent: user.email,
          respondedAt: new Date(),
        },
        create: {
          assessmentId,
          processStepId: step.id,
          fitStatus: parsed.data.fitStatus,
          respondent: user.email,
          respondedAt: new Date(),
        },
      }),
    );

    if (existing) {
      updated++;
    } else {
      created++;
    }
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }

  // Log bulk decision
  await logDecision({
    assessmentId,
    entityType: "process_step",
    entityId: "bulk",
    action: parsed.data.fitStatus === "FIT" ? "MARKED_FIT" : "MARKED_FIT",
    newValue: {
      scopeItemId: parsed.data.scopeItemId,
      fitStatus: parsed.data.fitStatus,
      count: created + updated,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({
    data: {
      updated,
      created,
      skipped,
      total: steps.length,
    },
  });
}
