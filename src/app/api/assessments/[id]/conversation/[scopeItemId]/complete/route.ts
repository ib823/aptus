/** POST: Finalize a conversation session and apply derived classifications */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { applyClassifications } from "@/lib/conversation/classification-applier";
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
