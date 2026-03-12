/** POST: Attendee heartbeat — update connection status and lastPingAt */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
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
    select: { id: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  const attendee = await prisma.workshopAttendee.findUnique({
    where: {
      sessionId_userId: { sessionId, userId: user.id },
    },
    select: { id: true },
  });

  if (!attendee) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Not an attendee of this session" } },
      { status: 404 },
    );
  }

  await prisma.workshopAttendee.update({
    where: { id: attendee.id },
    data: {
      connectionStatus: "connected",
      lastPingAt: new Date(),
    },
  });

  return NextResponse.json({ data: { ok: true } });
}
