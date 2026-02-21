/** PUT: Update workshop (start, complete, cancel, update notes) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export const preferredRegion = "sin1";
export const maxDuration = 30;

const updateWorkshopSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  notes: z.string().max(5000).optional(),
  attendeeCount: z.number().int().min(0).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; workshopId: string }> },
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

  const { id: assessmentId, workshopId } = await params;

  const body: unknown = await request.json();
  const parsed = updateWorkshopSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const workshop = await prisma.workshopSession.findUnique({
    where: { id: workshopId },
  });

  if (!workshop || workshop.assessmentId !== assessmentId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.attendeeCount !== undefined) updateData.attendeeCount = parsed.data.attendeeCount;

  let action: "WORKSHOP_STARTED" | "WORKSHOP_COMPLETED" | "PHASE_UPDATED" = "PHASE_UPDATED";

  if (parsed.data.status !== undefined) {
    updateData.status = parsed.data.status;
    if (parsed.data.status === "in_progress") {
      updateData.startedAt = new Date();
      action = "WORKSHOP_STARTED";
    }
    if (parsed.data.status === "completed") {
      updateData.completedAt = new Date();
      action = "WORKSHOP_COMPLETED";
    }
  }

  const updated = await prisma.workshopSession.update({
    where: { id: workshopId },
    data: updateData,
  });

  await logDecision({
    assessmentId,
    entityType: "workshop_session",
    entityId: workshopId,
    action,
    oldValue: { status: workshop.status },
    newValue: { status: updated.status, title: updated.title },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: updated });
}
