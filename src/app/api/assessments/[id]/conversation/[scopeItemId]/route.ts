/** GET: Fetch conversation templates + session state for a scope item */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; scopeItemId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, scopeItemId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;
  const { user } = access;

  const [templates, session] = await Promise.all([
    prisma.conversationTemplate.findMany({
      where: { scopeItemId, isActive: true },
      orderBy: { version: "desc" },
    }),
    prisma.conversationSession.findFirst({
      where: {
        assessmentId,
        userId: user.id,
        scopeItemId,
        status: "in_progress",
      },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    data: {
      templates,
      session,
    },
  });
}
