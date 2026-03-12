/**
 * Phase: Dependency Engine — POST undo a propagation event.
 *
 * Reverts a specific propagation log entry and all related
 * sibling propagations from the same trigger.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { PropagationEngine } from "@/lib/dependency/propagation-engine";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const bodySchema = z.object({
  propagationLogId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isFeatureEnabled("DEPENDENCY_ENGINE")) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Dependency engine is not enabled" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;
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

  const parsed = bodySchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "propagationLogId is required" } },
      { status: 400 },
    );
  }

  const { propagationLogId } = parsed.data;

  // Verify the log entry belongs to this assessment
  const logEntry = await prisma.dependencyPropagationLog.findUnique({
    where: { id: propagationLogId },
    select: { assessmentId: true, affectedStepId: true },
  });

  if (!logEntry || logEntry.assessmentId !== assessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Propagation log entry not found" } },
      { status: 404 },
    );
  }

  // Look up scope item code from the affected step's activity chain
  const step = await prisma.processStep.findUnique({
    where: { id: logEntry.affectedStepId },
    select: {
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

  const scopeItemCode =
    step?.activity?.processFlow?.solutionProcess?.scopeItemId;

  if (!scopeItemCode) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Could not resolve scope item" } },
      { status: 404 },
    );
  }

  const engine = await PropagationEngine.forScope(scopeItemCode);
  const result = await engine.undoPropagation(assessmentId, propagationLogId, user.id);

  return NextResponse.json({ data: result });
}
