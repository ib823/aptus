/** POST: Join a workshop session by session code */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export const preferredRegion = "sin1";
export const maxDuration = 30;

const JoinSchema = z.object({
  sessionCode: z.string().min(1).max(10).toUpperCase(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const body: unknown = await request.json();
  const parsed = JoinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid session code" } },
      { status: 400 },
    );
  }

  const session = await prisma.workshopSession.findUnique({
    where: { sessionCode: parsed.data.sessionCode },
    select: {
      id: true,
      assessmentId: true,
      status: true,
      title: true,
    },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  if (session.status === "completed" || session.status === "cancelled") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "This workshop session has ended" } },
      { status: 400 },
    );
  }

  // Validate user is a stakeholder in the assessment
  const stakeholder = await prisma.assessmentStakeholder.findFirst({
    where: { assessmentId: session.assessmentId, userId: user.id },
    select: { id: true },
  });

  // Allow platform admins and consultants even without stakeholder record
  const isPrivileged = user.role === "platform_admin" || user.role === "consultant";
  if (!stakeholder && !isPrivileged) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "You are not a stakeholder in this assessment" } },
      { status: 403 },
    );
  }

  // Upsert attendee record
  const attendee = await prisma.workshopAttendee.upsert({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: user.id,
      },
    },
    update: {
      connectionStatus: "connected",
      lastPingAt: new Date(),
      leftAt: null,
    },
    create: {
      sessionId: session.id,
      userId: user.id,
      role: session.assessmentId ? "attendee" : "attendee",
    },
  });

  // Update attendee count
  const count = await prisma.workshopAttendee.count({
    where: { sessionId: session.id, connectionStatus: "connected" },
  });
  await prisma.workshopSession.update({
    where: { id: session.id },
    data: { attendeeCount: count },
  });

  return NextResponse.json({
    data: {
      sessionId: session.id,
      assessmentId: session.assessmentId,
      title: session.title,
      attendeeId: attendee.id,
    },
  });
}
