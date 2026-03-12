/** POST: Acquire an editing lock */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { ERROR_CODES } from "@/types/api";
import { acquireLock } from "@/lib/collaboration/lock-manager";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const acquireSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
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

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = acquireSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const result = await acquireLock({
    assessmentId,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    userId: user.id,
    userName: user.name ?? user.email,
  });

  if (!result.lock) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.CONFLICT,
          message: `Entity is locked by ${result.heldBy?.lockedByName ?? "another user"}`,
        },
        data: { heldBy: result.heldBy },
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ data: result.lock }, { status: 201 });
}
