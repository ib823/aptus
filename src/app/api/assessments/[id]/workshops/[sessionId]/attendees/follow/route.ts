/** PUT: Toggle follow/unfollow presenter */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";

const FollowSchema = z.object({
  isFollowing: z.boolean(),
});

export async function PUT(
  request: NextRequest,
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

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = FollowSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
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

  const updated = await prisma.workshopAttendee.update({
    where: { id: attendee.id },
    data: { isFollowing: parsed.data.isFollowing },
    select: { id: true, isFollowing: true },
  });

  return NextResponse.json({ data: updated });
}
