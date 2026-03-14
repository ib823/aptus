/** GET: Vote tally for a specific process step */

import { NextResponse, type NextRequest } from "next/server";
import { requireAssessmentAccess, isAssessmentAccessError } from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { computeVoteTally } from "@/lib/workshop/vote-tally";
import { ERROR_CODES } from "@/types/api";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; processStepId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, sessionId, processStepId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) return access;

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

  const votes = await prisma.workshopVote.findMany({
    where: { sessionId, processStepId },
    select: { userId: true, classification: true },
  });

  const tally = computeVoteTally(processStepId, votes);

  return NextResponse.json({ data: tally });
}
