/** GET: List workshop attendees */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
export async function GET(
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
    select: { id: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  const attendees = await prisma.workshopAttendee.findMany({
    where: { sessionId },
    select: {
      id: true,
      userId: true,
      role: true,
      joinedAt: true,
      leftAt: true,
      isFollowing: true,
      isPresenter: true,
      connectionStatus: true,
      lastPingAt: true,
      user: {
        select: { name: true, email: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const data = attendees.map((a) => ({
    id: a.id,
    userId: a.userId,
    name: a.user.name,
    email: a.user.email,
    role: a.role,
    connectionStatus: a.connectionStatus,
    isFollowing: a.isFollowing,
    isPresenter: a.isPresenter,
    joinedAt: a.joinedAt.toISOString(),
    leftAt: a.leftAt?.toISOString() ?? null,
    lastPingAt: a.lastPingAt.toISOString(),
  }));

  return NextResponse.json({ data });
}
