/** POST: End a workshop session. Facilitator only. */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export const preferredRegion = "sin1";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
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

  const { id: assessmentId, sessionId } = await params;

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

  return NextResponse.json({
    data: { id: updated.id, status: updated.status, completedAt: updated.completedAt, duration: updated.duration },
  });
}
