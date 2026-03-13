/** PUT: Upsert step response */

import { NextResponse, type NextRequest } from "next/server";
import { canEditStepResponse } from "@/lib/auth/permissions";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { logStepResponseChange } from "@/lib/audit/temporal-logger";
import { detectConflict } from "@/lib/collaboration/conflict-detector";
import { logActivity } from "@/lib/collaboration/activity-logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { PropagationEngine } from "@/lib/dependency/propagation-engine";
import type { DependencyEffects } from "@/lib/dependency/types";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
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
  const { id: assessmentId, stepId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

  const { user } = access;

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = responseSchema.safeParse(bodyResult.data);
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

  // Scope validation: step's scope item must be selected in this assessment
  const scopeSelection = await prisma.scopeSelection.findFirst({
    where: { assessmentId, scopeItemId: step.scopeItemId, selected: true },
    select: { id: true },
  });
  if (!scopeSelection) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Scope item not selected in this assessment" } },
      { status: 403 },
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

  // Log temporal history
  void logStepResponseChange({
    stepResponseId: response.id,
    actorId: user.id,
    actorName: user.name || user.email,
    actionType: existing ? "UPDATED" : "CREATED",
    previousStatus: existing?.fitStatus || "PENDING",
    newStatus: response.fitStatus,
    previousNote: existing?.clientNote,
    newNote: response.clientNote,
    metadata: { reason: parsed.data.overrideReason }
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

  // Fire-and-forget: conflict detection + activity logging
  detectConflict({
    assessmentId,
    entityType: "process_step",
    entityId: stepId,
    userId: user.id,
    userName: user.name ?? user.email,
    classification: parsed.data.fitStatus,
  }).catch((err) => console.error("[CONFLICT] Failed to detect conflict:", err));

  logActivity({
    assessmentId,
    actorId: user.id,
    actorName: user.name ?? user.email,
    actorRole: user.role,
    actionType: "classified_steps",
    summary: `classified step as ${parsed.data.fitStatus}`,
    entityType: "process_step",
    entityId: stepId,
    areaCode: step.scopeItem.functionalArea,
  }).catch((err) => console.error("[ACTIVITY] Failed to log step classification:", err));

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

  // Phase: Dependency Engine — evaluate propagation effects
  let dependencyEffects: DependencyEffects | undefined;

  if (isFeatureEnabled("DEPENDENCY_ENGINE")) {
    try {
      // Look up activity + scope item code for this step
      const stepWithActivity = await prisma.processStep.findUnique({
        where: { id: stepId },
        select: {
          activityId: true,
          activity: {
            select: {
              processFlow: {
                select: {
                  solutionProcess: {
                    select: { scopeItemId: true },
                  },
                },
              },
            },
          },
        },
      });

      if (stepWithActivity?.activityId) {
        const scopeItemCode =
          stepWithActivity.activity?.processFlow?.solutionProcess
            ?.scopeItemId;

        if (scopeItemCode) {
          const engine = await PropagationEngine.forScope(scopeItemCode);
          const activityId = stepWithActivity.activityId;

          // If changing FROM NA to something else → reverse propagation
          const oldStatus = existing?.fitStatus;
          if (oldStatus === "NA" && parsed.data.fitStatus !== "NA") {
            const reversed = await engine.reversePropagation(
              assessmentId,
              activityId,
              user.id,
            );
            dependencyEffects = {
              propagations: [],
              warnings: [],
              reversed,
            };
          }
          // If new classification is NA → evaluate forward propagation
          else if (parsed.data.fitStatus === "NA") {
            const result = await engine.evaluate(
              assessmentId,
              activityId,
              "NA",
            );

            if (result.propagations.length > 0) {
              await engine.applyPropagations(
                assessmentId,
                stepId,
                result.propagations,
                user.id,
              );
            }

            dependencyEffects = {
              propagations: result.propagations.map((p) => ({
                activityId: p.activityId,
                activityTitle: p.activityTitle,
                stepCount: p.affectedStepIds.length,
                businessReason: p.businessReason,
              })),
              warnings: result.warnings.map((w) => ({
                activityId: w.activityId,
                activityTitle: w.activityTitle,
                scopeItemCode: w.scopeItemCode,
                warningType: w.warningType,
                businessReason: w.businessReason,
              })),
            };
          }
        }
      }
    } catch (err) {
      // Dependency engine errors should not block classification
      console.error("[DependencyEngine] propagation error:", err);
    }
  }

  return NextResponse.json({
    data: response,
    ...(dependencyEffects && { dependencyEffects }),
  });
}
