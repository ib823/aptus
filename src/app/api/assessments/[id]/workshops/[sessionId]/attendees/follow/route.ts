/** PUT: Toggle follow/unfollow presenter */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

const FollowSchema = z.object({
  isFollowing: z.boolean(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const { sessionId } = await params;

  const body: unknown = await request.json();
  const parsed = FollowSchema.safeParse(body);
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
