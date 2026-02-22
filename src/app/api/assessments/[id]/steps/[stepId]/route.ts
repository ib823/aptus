/** PUT: Upsert step response */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, canEditStepResponse } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import type { DecisionAction } from "@/types/assessment";
import { z } from "zod";

const responseSchema = z
  .object({
    fitStatus: z.enum(["FIT", "CONFIGURE", "GAP", "NA", "PENDING"]),
    clientNote: z.string().max(5000).optional(),
    currentProcess: z.string().max(5000).optional(),
    overrideReason: z.string().optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    evidenceUrls: z.array(z.string().url()).optional(),
  })
  .refine(
    (data) => data.fitStatus !== "GAP" || (data.clientNote && data.clientNote.length >= 10),
    { message: "Gap note is required (min 10 characters) when status is GAP", path: ["clientNote"] },
  );
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
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

  const { id: assessmentId, stepId } = await params;

  const body: unknown = await request.json();
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Get the process step and its scope item's functional area
  const step = await prisma.processStep.findUnique({
    where: { id: stepId },
    select: {
      scopeItemId: true,
      scopeItem: {
        select: { functionalArea: true },
      },
    },
  });

  if (!step) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Process step not found" } },
      { status: 404 },
    );
  }

  // Check permissions
  const permCheck = await canEditStepResponse(
    user,
    assessmentId,
    step.scopeItem.functionalArea,
    parsed.data.overrideReason,
  );
  if (!permCheck.allowed) {
    return NextResponse.json(
      { error: { code: permCheck.code ?? ERROR_CODES.FORBIDDEN, message: permCheck.message ?? "Forbidden" } },
      { status: 403 },
    );
  }

  // IT leads can only modify clientNote, not fitStatus
  if (user.role === "it_lead") {
    const existing = await prisma.stepResponse.findUnique({
      where: { assessmentId_processStepId: { assessmentId, processStepId: stepId } },
      select: { fitStatus: true },
    });

    if (existing && parsed.data.fitStatus !== existing.fitStatus) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.FORBIDDEN, message: "IT leads cannot change fitStatus" } },
        { status: 403 },
      );
    }
  }

  // Get existing for decision log
  const existing = await prisma.stepResponse.findUnique({
    where: { assessmentId_processStepId: { assessmentId, processStepId: stepId } },
    select: { fitStatus: true, clientNote: true },
  });

  // Upsert the response
  const responseData = {
    fitStatus: parsed.data.fitStatus,
    clientNote: parsed.data.clientNote ?? null,
    currentProcess: parsed.data.currentProcess ?? null,
    respondent: user.email,
    respondedAt: new Date(),
    confidence: parsed.data.confidence ?? null,
    evidenceUrls: parsed.data.evidenceUrls ?? [],
    reviewedBy: user.email,
    reviewedAt: new Date(),
  };

  const response = await prisma.stepResponse.upsert({
    where: {
      assessmentId_processStepId: { assessmentId, processStepId: stepId },
    },
    update: responseData,
    create: {
      assessmentId,
      processStepId: stepId,
      ...responseData,
    },
  });

  // Log decision
  const actionMap: Record<string, DecisionAction> = {
    FIT: "MARKED_FIT",
    GAP: "MARKED_GAP",
    CONFIGURE: "MARKED_FIT", // MARKED_FIT covers CONFIGURE too
    NA: "MARKED_FIT",
    PENDING: "MARKED_FIT",
  };
  const action = actionMap[parsed.data.fitStatus] ?? "MARKED_FIT";

  await logDecision({
    assessmentId,
    entityType: "process_step",
    entityId: stepId,
    action,
    oldValue: existing ? { fitStatus: existing.fitStatus } : undefined,
    newValue: { fitStatus: parsed.data.fitStatus },
    actor: user.email,
    actorRole: user.role,
    reason: parsed.data.overrideReason,
  });

  // If GAP, auto-create GapResolution if not exists
  if (parsed.data.fitStatus === "GAP") {
    const existingGap = await prisma.gapResolution.findFirst({
      where: { assessmentId, processStepId: stepId },
    });

    if (!existingGap) {
      await prisma.gapResolution.create({
        data: {
          assessmentId,
          processStepId: stepId,
          scopeItemId: step.scopeItemId,
          gapDescription: parsed.data.clientNote ?? "",
          resolutionType: "PENDING",
          resolutionDescription: "",
        },
      });
    }
  }

  return NextResponse.json({ data: response });
}
