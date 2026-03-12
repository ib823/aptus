/** GET: List votes for session, POST: Submit a vote */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";

const VoteSchema = z.object({
  processStepId: z.string().min(1),
  classification: z.enum(["FIT", "CONFIGURE", "GAP", "NA"]),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  notes: z.string().max(2000).optional(),
});
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, sessionId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }

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
    where: { sessionId },
    orderBy: { votedAt: "desc" },
  });

  return NextResponse.json({ data: votes });
}

export async function POST(
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
    select: { id: true, status: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  if (session.status !== "in_progress") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Voting is only allowed during an active workshop" } },
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
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only workshop attendees can vote" } },
      { status: 403 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = VoteSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const step = await prisma.processStep.findUnique({
    where: { id: parsed.data.processStepId },
    select: { scopeItemId: true },
  });

  if (!step) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Process step not found" } },
      { status: 404 },
    );
  }

  const scopeSelection = await prisma.scopeSelection.findFirst({
    where: { assessmentId, scopeItemId: step.scopeItemId, selected: true },
    select: { id: true },
  });

  if (!scopeSelection) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Process step is not in scope for this assessment" } },
      { status: 403 },
    );
  }

  const vote = await prisma.workshopVote.upsert({
    where: {
      sessionId_processStepId_userId: {
        sessionId,
        processStepId: parsed.data.processStepId,
        userId: user.id,
      },
    },
    update: {
      classification: parsed.data.classification,
      confidence: parsed.data.confidence ?? null,
      notes: parsed.data.notes ?? null,
      votedAt: new Date(),
    },
    create: {
      sessionId,
      processStepId: parsed.data.processStepId,
      userId: user.id,
      classification: parsed.data.classification,
      confidence: parsed.data.confidence ?? null,
      notes: parsed.data.notes ?? null,
    },
  });

  return NextResponse.json({ data: vote }, { status: 201 });
}
