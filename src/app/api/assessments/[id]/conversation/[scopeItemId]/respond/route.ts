/** POST: Submit an answer in a conversation session, get next question */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const { id: assessmentId, scopeItemId } = await params;

  const body: unknown = await request.json();
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const { sessionId, questionId, answerId, processStepId } = parsed.data;

  // Fetch session and template
  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.assessmentId !== assessmentId || session.userId !== user.id) {
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
