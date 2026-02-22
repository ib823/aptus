/** POST: Finalize a vote tally as a StepResponse */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { computeVoteTally } from "@/lib/workshop/vote-tally";
import { ERROR_CODES } from "@/types/api";
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; processStepId: string }> },
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

  const { id: assessmentId, sessionId, processStepId } = await params;

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: { id: true, facilitatorId: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  // Only facilitator or admin can finalize
  if (session.facilitatorId !== user.id && user.role !== "platform_admin") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only the facilitator can finalize votes" } },
      { status: 403 },
    );
  }

  const votes = await prisma.workshopVote.findMany({
    where: { sessionId, processStepId },
    select: { userId: true, classification: true },
  });

  if (votes.length === 0) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No votes to finalize" } },
      { status: 400 },
    );
  }

  const tally = computeVoteTally(processStepId, votes);

  if (!tally.hasConsensus || !tally.consensus) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No consensus reached. Override or gather more votes." } },
      { status: 400 },
    );
  }

  // Create or update StepResponse with the consensus classification
  const stepResponse = await prisma.stepResponse.upsert({
    where: {
      assessmentId_processStepId: {
        assessmentId,
        processStepId,
      },
    },
    update: {
      fitStatus: tally.consensus,
      respondent: user.id,
      respondedAt: new Date(),
      clientNote: `Workshop vote: ${tally.consensusPercentage}% consensus (${tally.totalVotes} votes)`,
    },
    create: {
      assessmentId,
      processStepId,
      fitStatus: tally.consensus,
      respondent: user.id,
      respondedAt: new Date(),
      clientNote: `Workshop vote: ${tally.consensusPercentage}% consensus (${tally.totalVotes} votes)`,
    },
  });

  return NextResponse.json({
    data: {
      stepResponseId: stepResponse.id,
      fitStatus: stepResponse.fitStatus,
      tally,
    },
  });
}
