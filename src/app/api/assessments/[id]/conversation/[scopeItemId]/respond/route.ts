/** POST: Submit an answer in a conversation session, get next question */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import { getNextQuestion } from "@/lib/conversation/tree-engine";
import type { QuestionFlow, ConversationResponse } from "@/types/conversation";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import { z } from "zod";

const respondSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  answerId: z.string().min(1),
  processStepId: z.string().min(1),
});
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scopeItemId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, scopeItemId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = respondSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const { sessionId, questionId, answerId, processStepId } = parsed.data;

  // Fetch session and template
  const session = await prisma.conversationSession.findFirst({
    where: { id: sessionId, assessmentId, scopeItemId, userId: user.id },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Session not found" } },
      { status: 404 },
    );
  }

  if (session.status !== "in_progress") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Session is not in progress" } },
      { status: 400 },
    );
  }

  const template = await prisma.conversationTemplate.findFirst({
    where: { scopeItemId, processStepId, isActive: true },
    orderBy: { version: "desc" },
  });

  if (!template) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "No template found for this step" } },
      { status: 404 },
    );
  }

  const flow = template.questionFlow as unknown as QuestionFlow;
  const result = getNextQuestion(flow, questionId, answerId, processStepId);

  // Append response to session
  const existingResponses = (session.responses ?? []) as unknown as ConversationResponse[];
  const newResponse: ConversationResponse = {
    questionId,
    answerId,
    answeredAt: new Date().toISOString(),
  };
  const updatedResponses = [...existingResponses, newResponse];

  // Build the update payload — handle classification vs continuation
  if (result.classification) {
    const derivedClassifications = [
      {
        processStepId,
        classification: result.classification,
        confidence: "high",
        derivedFrom: updatedResponses.map((r) => r.questionId),
      },
    ];
    const updatedSession = await prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        responses: updatedResponses as unknown as InputJsonValue,
        currentQuestionId: null,
        status: "completed",
        derivedClassifications: derivedClassifications as unknown as InputJsonValue,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      data: {
        session: updatedSession,
        nextQuestion: null,
        classification: result.classification,
      },
    });
  }

  const updatedSession = await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      responses: updatedResponses as unknown as InputJsonValue,
      currentQuestionId: result.nextQuestion?.id ?? null,
    },
  });

  return NextResponse.json({
    data: {
      session: updatedSession,
      nextQuestion: result.nextQuestion ?? null,
      classification: null,
    },
  });
}
