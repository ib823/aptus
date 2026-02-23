/** POST: Attendee heartbeat — update connection status and lastPingAt */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

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

  const { sessionId } = await params;

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
