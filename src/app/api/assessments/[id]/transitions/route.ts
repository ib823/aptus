/** GET: Available transitions for current user + status */
/** POST: Execute a status transition */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import { canTransition, getAvailableTransitions } from "@/lib/assessment/status-machine";
import { logActivity } from "@/lib/collaboration/activity-logger";
import { z } from "zod";

const transitionSchema = z.object({
  toStatus: z.string().min(1),
  reason: z.string().max(1000).optional(),
});
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user, assessment } = access;

  const available = getAvailableTransitions(assessment.status, user.role);

  return NextResponse.json({
    data: {
      currentStatus: assessment.status,
      availableTransitions: available,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user, assessment } = access;

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = transitionSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const result = canTransition(assessment.status, parsed.data.toStatus, user.role);
  if (!result.allowed) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.CONFLICT, message: result.reason ?? "Transition not allowed" } },
      { status: 409 },
    );
  }

  // Gap approval gate: gap_resolution -> pending_validation requires all gaps resolved + approved
  if (assessment.status === "gap_resolution" && parsed.data.toStatus === "pending_validation") {
    const gapCounts = await prisma.gapResolution.aggregate({
      where: { assessmentId: id },
      _count: { id: true },
    });
    const unresolvedCount = await prisma.gapResolution.count({
      where: { assessmentId: id, resolutionType: "PENDING" },
    });
    const unapprovedCount = await prisma.gapResolution.count({
      where: { assessmentId: id, clientApproved: false, NOT: { resolutionType: "PENDING" } },
    });

    if (gapCounts._count.id === 0) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.GAPS_NOT_APPROVED, message: "No gaps found for this assessment" } },
        { status: 422 },
      );
    }
    if (unresolvedCount > 0) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.GAPS_NOT_APPROVED, message: `${unresolvedCount} gap(s) still unresolved` } },
        { status: 422 },
      );
    }
    if (unapprovedCount > 0) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.GAPS_NOT_APPROVED, message: `${unapprovedCount} gap(s) not yet approved by client` } },
        { status: 422 },
      );
    }
  }

  const previousStatus = assessment.status;

  // Update status
  const updated = await prisma.assessment.update({
    where: { id },
    data: { status: parsed.data.toStatus },
    select: { id: true, status: true, updatedAt: true },
  });

  // Log transition
  await prisma.statusTransitionLog.create({
    data: {
      assessmentId: id,
      fromStatus: previousStatus,
      toStatus: parsed.data.toStatus,
      triggeredBy: user.id,
      triggeredByRole: user.role,
      reason: parsed.data.reason ?? null,
    },
  });

  await logDecision({
    assessmentId: id,
    entityType: "assessment",
    entityId: id,
    action: "STATUS_TRANSITIONED",
    oldValue: { status: previousStatus },
    newValue: { status: parsed.data.toStatus },
    actor: user.email,
    actorRole: user.role,
    reason: parsed.data.reason,
  });

  // Log activity (fire-and-forget)
  logActivity({
    assessmentId: id,
    actorId: user.id,
    actorName: user.name ?? user.email,
    actorRole: user.role,
    actionType: "status_changed",
    summary: `changed status from ${previousStatus} to ${parsed.data.toStatus}`,
    entityType: "assessment",
    entityId: id,
  }).catch((err) => console.error("[ACTIVITY] Failed to log status transition:", err));

  return NextResponse.json({
    data: {
      id: updated.id,
      status: updated.status,
      previousStatus,
      transitionedAt: updated.updatedAt.toISOString(),
      transitionedBy: user.id,
    },
  });
}
