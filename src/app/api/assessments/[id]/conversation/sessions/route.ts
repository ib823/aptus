/** GET: List conversation sessions for the current user in an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const { user } = access;

  const sessions = await prisma.conversationSession.findMany({
    where: {
      assessmentId,
      userId: user.id,
    },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({ data: sessions });
}
