/** POST: Release an editing lock */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { ERROR_CODES } from "@/types/api";
import { releaseLock } from "@/lib/collaboration/lock-manager";
import { z } from "zod";

const releaseSchema = z.object({
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
  const parsed = releaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const released = await releaseLock({
    assessmentId,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    userId: user.id,
  });

  if (!released) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "No active lock found for this entity" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: { released: true } });
}
