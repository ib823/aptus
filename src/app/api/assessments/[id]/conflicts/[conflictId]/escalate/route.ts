/** PUT: Escalate a conflict */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export const preferredRegion = "sin1";
export const maxDuration = 30;

const EscalateConflictSchema = z.object({
  escalatedToId: z.string().min(1),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; conflictId: string }> },
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

  const { id: assessmentId, conflictId } = await params;

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

  const body = await request.json();
  const parsed = EscalateConflictSchema.safeParse(body);
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
