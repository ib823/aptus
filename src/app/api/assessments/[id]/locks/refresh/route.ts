/** POST: Refresh (extend) an editing lock's expiry */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { ERROR_CODES } from "@/types/api";
import { refreshLock } from "@/lib/collaboration/lock-manager";
import { z } from "zod";

const refreshSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { id: assessmentId } = await params;

  const body: unknown = await request.json();
  const parsed = refreshSchema.safeParse(body);
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
