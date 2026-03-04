/** POST: Bulk mark steps as FIT or NA */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, canEditStepResponse } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { logStepResponseChange } from "@/lib/audit/temporal-logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { PropagationEngine } from "@/lib/dependency/propagation-engine";
import type { DependencyEffects } from "@/lib/dependency/types";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const bulkSchema = z.object({
  scopeItemId: z.string(),
  fitStatus: z.enum(["FIT", "CONFIGURE", "GAP", "NA"]),
  stepIds: z.array(z.string()).min(1).max(5000).optional(),
  clientNote: z.string().optional(),
  excludeStepTypes: z.array(
    z.enum([
      "LOGON", "ACCESS_APP", "INFORMATION", "DATA_ENTRY",
      "ACTION", "VERIFICATION", "NAVIGATION", "PROCESS_STEP",
    ]),
  ).optional(),
});
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

  // Scope validation: scope item must be selected in this assessment
  const scopeSelection = await prisma.scopeSelection.findFirst({
    where: { assessmentId, scopeItemId: parsed.data.scopeItemId, selected: true },
    select: { id: true },
  });
  if (!scopeSelection) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Scope item not selected in this assessment" } },
      { status: 403 },
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
    select: { processStepId: true, fitStatus: true, clientNote: true },
  });

  const existingMap = new Map(existingResponses.map((r) => [r.processStepId, r.fitStatus]));
  const existingNoteMap = new Map(existingResponses.map((r) => [r.processStepId, r.clientNote]));

  let updated = 0;
  let created = 0;
  let skipped = 0;

  // Track operation data for auditing
  const auditMetadata: Array<{ stepId: string; prevStatus: string; prevNote: string | null }> = [];

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

    auditMetadata.push({
      stepId: step.id,
      prevStatus: existing || "PENDING",
      prevNote: existingNoteMap.get(step.id) || null,
    });

    operations.push(
      prisma.stepResponse.upsert({
        where: {
          assessmentId_processStepId: { assessmentId, processStepId: step.id },
        },
        update: {
          fitStatus: parsed.data.fitStatus,
          respondent: user.email,
          respondedAt: new Date(),
          ...(parsed.data.clientNote != null ? { clientNote: parsed.data.clientNote } : {}),
        },
        create: {
          assessmentId,
          processStepId: step.id,
          fitStatus: parsed.data.fitStatus,
          respondent: user.email,
          respondedAt: new Date(),
          ...(parsed.data.clientNote != null ? { clientNote: parsed.data.clientNote } : {}),
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
    const results = await prisma.$transaction(operations);
    
    // Log temporal history for each affected step
    void Promise.all(results.map(async (res, idx) => {
      const meta = auditMetadata[idx];
      if (meta) {
        await logStepResponseChange({
          stepResponseId: res.id,
          actorId: user.id,
          actorName: user.name || user.email,
          actionType: meta.prevStatus === "PENDING" ? "CREATED" : "UPDATED",
          previousStatus: meta.prevStatus,
          newStatus: res.fitStatus,
          previousNote: meta.prevNote,
          newNote: res.clientNote,
          metadata: { bulk: true, scopeItemId: parsed.data.scopeItemId }
        });
      }
    }));
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

  // Phase: Dependency Engine — evaluate propagation after bulk classification
  let dependencyEffects: DependencyEffects | undefined;

  if (isFeatureEnabled("DEPENDENCY_ENGINE") && operations.length > 0) {
    try {
      // Find the activity for the first step to get scope item code
      const firstStepId = parsed.data.stepIds?.[0] ?? steps[0]?.id;
      if (firstStepId) {
        const stepWithActivity = await prisma.processStep.findUnique({
          where: { id: firstStepId },
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
            stepWithActivity.activity?.processFlow?.solutionProcess?.scopeItemId;

          if (scopeItemCode) {
            const engine = await PropagationEngine.forScope(scopeItemCode);
            const activityId = stepWithActivity.activityId;

            if (parsed.data.fitStatus === "NA") {
              const result = await engine.evaluate(assessmentId, activityId, "NA");

              if (result.propagations.length > 0) {
                await engine.applyPropagations(
                  assessmentId,
                  firstStepId,
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
            } else {
              // Changing from NA to something else — reverse propagation
              const reversed = await engine.reversePropagation(
                assessmentId,
                activityId,
                user.id,
              );
              if (reversed.undoneSteps.length > 0) {
                dependencyEffects = {
                  propagations: [],
                  warnings: [],
                  reversed,
                };
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[DependencyEngine] bulk propagation error:", err);
    }
  }

  return NextResponse.json({
    data: {
      updated,
      created,
      skipped,
      total: steps.length,
    },
    ...(dependencyEffects && { dependencyEffects }),
  });
}
