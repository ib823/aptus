/** POST: Finalize a conversation session and apply derived classifications */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import type { DerivedClassification } from "@/types/conversation";
import { z } from "zod";

const completeSchema = z.object({
  sessionId: z.string().min(1),
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

  const { id: assessmentId } = await params;

  const body: unknown = await request.json();
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const { sessionId } = parsed.data;

  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.assessmentId !== assessmentId || session.userId !== user.id) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Session not found" } },
      { status: 404 },
    );
  }

  if (session.status !== "completed") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Session is not completed. Answer all questions first." } },
      { status: 400 },
    );
  }

  const classifications = (session.derivedClassifications ?? []) as unknown as DerivedClassification[];

  // Apply each classification to the step response
  for (const dc of classifications) {
    const existing = await prisma.stepResponse.findUnique({
      where: {
        assessmentId_processStepId: { assessmentId, processStepId: dc.processStepId },
      },
      select: { fitStatus: true },
    });

    await prisma.stepResponse.upsert({
      where: {
        assessmentId_processStepId: { assessmentId, processStepId: dc.processStepId },
      },
      update: {
        fitStatus: dc.classification,
        respondent: user.email,
        respondedAt: new Date(),
        confidence: dc.confidence,
        reviewedBy: user.email,
        reviewedAt: new Date(),
      },
      create: {
        assessmentId,
        processStepId: dc.processStepId,
        fitStatus: dc.classification,
        respondent: user.email,
        respondedAt: new Date(),
        confidence: dc.confidence,
        reviewedBy: user.email,
        reviewedAt: new Date(),
      },
    });

    await logDecision({
      assessmentId,
      entityType: "process_step",
      entityId: dc.processStepId,
      action: "CONVERSATION_CLASSIFICATION_APPLIED",
      oldValue: existing ? { fitStatus: existing.fitStatus } : { fitStatus: "PENDING" },
      newValue: { fitStatus: dc.classification, derivedFrom: "conversation", sessionId },
      actor: user.email,
      actorRole: user.role,
      reason: `Classification derived from conversation session ${sessionId}`,
    });
  }

  return NextResponse.json({
    data: {
      applied: classifications.length,
      classifications,
    },
  });
}
