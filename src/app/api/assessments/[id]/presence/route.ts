/** GET: List active users on an assessment (last seen within 5 minutes) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

const PRESENCE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

  const { id: assessmentId } = await params;
  const cutoff = new Date(Date.now() - PRESENCE_TIMEOUT_MS);

  const activeUsers = await prisma.presenceRecord.findMany({
    where: {
      assessmentId,
      lastSeenAt: { gt: cutoff },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  return NextResponse.json({ data: activeUsers });
}
