/** POST: Upsert presence heartbeat */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const heartbeatSchema = z.object({
  currentPage: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const parsedBody = await safeParseJsonBody(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = heartbeatSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const record = await prisma.presenceRecord.upsert({
    where: {
      assessmentId_userId: { assessmentId, userId: user.id },
    },
    update: {
      userName: user.name ?? user.email,
      userRole: user.role,
      currentPage: parsed.data.currentPage ?? null,
      lastSeenAt: new Date(),
    },
    create: {
      assessmentId,
      userId: user.id,
      userName: user.name ?? user.email,
      userRole: user.role,
      currentPage: parsed.data.currentPage ?? null,
      lastSeenAt: new Date(),
    },
    select: {
      id: true,
      assessmentId: true,
      userId: true,
      userName: true,
      userRole: true,
      currentPage: true,
      lastSeenAt: true,
    },
  });

  return NextResponse.json({ data: record });
}
