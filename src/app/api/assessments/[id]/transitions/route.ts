/** GET: Available transitions for current user + status */
/** POST: Execute a status transition */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { canTransition, getAvailableTransitions } from "@/lib/assessment/status-machine";
import { z } from "zod";

const transitionSchema = z.object({
  toStatus: z.string().min(1),
  reason: z.string().max(1000).optional(),
});

export async function GET(
  _request: NextRequest,
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

  const { id } = await params;
  const assessment = await prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    select: { status: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

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

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const result = canTransition(assessment.status, parsed.data.toStatus, user.role);
  if (!result.allowed) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.CONFLICT, message: result.reason ?? "Transition not allowed" } },
      { status: 409 },
    );
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
