/** POST: End a workshop session. Facilitator or platform_admin only. */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, sessionId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: { id: true, status: true, facilitatorId: true, startedAt: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  if (session.facilitatorId !== user.id && user.role !== "platform_admin") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only the facilitator can end the workshop" } },
      { status: 403 },
    );
  }

  if (session.status !== "in_progress") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Workshop can only be ended from in_progress status" } },
      { status: 400 },
    );
  }

  const now = new Date();
  const duration = session.startedAt
    ? Math.round((now.getTime() - session.startedAt.getTime()) / 60000)
    : null;

  // Mark all attendees as disconnected
  await prisma.workshopAttendee.updateMany({
    where: { sessionId: session.id, connectionStatus: "connected" },
    data: { connectionStatus: "disconnected", leftAt: now },
  });

  const updated = await prisma.workshopSession.update({
    where: { id: session.id },
    data: {
      status: "completed",
      completedAt: now,
      duration,
    },
  });

  await logDecision({
    assessmentId,
    entityType: "workshop_session",
    entityId: session.id,
    action: "WORKSHOP_COMPLETED",
    oldValue: { status: "in_progress" },
    newValue: { status: "completed", completedAt: updated.completedAt, duration: updated.duration },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({
    data: { id: updated.id, status: updated.status, completedAt: updated.completedAt, duration: updated.duration },
  });
}
