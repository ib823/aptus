/** POST: Finalize a conversation session and apply derived classifications */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { applyClassifications } from "@/lib/conversation/classification-applier";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import type { DerivedClassification } from "@/types/conversation";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

const completeSchema = z.object({
  sessionId: z.string().min(1),
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

  const parsed = completeSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const { sessionId } = parsed.data;

  const session = await prisma.conversationSession.findFirst({
    where: { id: sessionId, assessmentId, scopeItemId, userId: user.id },
  });

  if (!session) {
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

  const result = await applyClassifications(
    assessmentId,
    user.id,
    user.name ?? user.email,
    user.role as UserRole,
    sessionId,
    classifications,
  );

  // Update session with apply counts
  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      completedAt: new Date(),
    },
  });

  return NextResponse.json({
    data: {
      applied: result.applied,
      skipped: result.skipped,
      gapsCreated: result.gapsCreated,
      classifications,
    },
  });
}
