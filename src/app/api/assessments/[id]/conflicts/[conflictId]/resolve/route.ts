/** PUT: Resolve a conflict */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

export const preferredRegion = "sin1";
export const maxDuration = 30;

const ResolveConflictSchema = z.object({
  resolvedClassification: z.string().min(1),
  resolutionNotes: z.string().max(5000).optional(),
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
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Conflict is already resolved" } },
      { status: 400 },
    );
  }

  const body = await request.json();
  const parsed = ResolveConflictSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  const updated = await prisma.conflict.update({
    where: { id: conflictId },
    data: {
      status: "RESOLVED",
      resolvedById: user.id,
      resolvedClassification: parsed.data.resolvedClassification,
      resolutionNotes: parsed.data.resolutionNotes ?? null,
      resolvedAt: new Date(),
    },
    include: {
      resolvedBy: { select: { id: true, name: true } },
    },
  });

  // Notify stakeholders about conflict resolution
  const stakeholders = await prisma.assessmentStakeholder.findMany({
    where: { assessmentId },
    select: { userId: true },
  });

  const recipientIds = stakeholders
    .map((s) => s.userId)
    .filter((id) => id !== user.id);

  if (recipientIds.length > 0) {
    dispatchNotification({
      type: "conflict_resolved",
      assessmentId,
      title: "Conflict resolved",
      body: `${user.name} resolved a conflict on ${conflict.entityType} ${conflict.entityId}`,
      deepLink: `/assessments/${assessmentId}/conflicts`,
      recipientUserIds: recipientIds,
    }).catch(() => { /* fire-and-forget */ });
  }

  return NextResponse.json({ data: updated });
}
