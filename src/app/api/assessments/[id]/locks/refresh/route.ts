/** POST: Refresh (extend) an editing lock's expiry */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { ERROR_CODES } from "@/types/api";
import { refreshLock } from "@/lib/collaboration/lock-manager";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const refreshSchema = z.object({
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

  const parsed = refreshSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const refreshed = await refreshLock({
    assessmentId,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    userId: user.id,
  });

  if (!refreshed) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "No active lock found to refresh" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: { refreshed: true } });
}
