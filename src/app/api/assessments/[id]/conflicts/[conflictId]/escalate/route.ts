/** PUT: Escalate a conflict */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";

const EscalateConflictSchema = z.object({
  escalatedToId: z.string().min(1),
});
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; conflictId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, conflictId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }

  const conflict = await prisma.conflict.findFirst({
    where: { id: conflictId, assessmentId },
  });

  if (!conflict) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Conflict not found" } },
      { status: 404 },
    );
  }

  if (conflict.status === "RESOLVED") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Cannot escalate a resolved conflict" } },
      { status: 400 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = EscalateConflictSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  const updated = await prisma.conflict.update({
    where: { id: conflictId },
    data: {
      status: "ESCALATED",
      escalatedToId: parsed.data.escalatedToId,
      escalatedAt: new Date(),
    },
    include: {
      resolvedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: updated });
}
