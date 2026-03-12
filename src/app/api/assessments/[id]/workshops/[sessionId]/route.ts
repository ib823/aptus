/** GET: Get workshop session detail */
/** PUT: Update workshop session (title, description, scheduledAt, notes, attendeeCount) */

import { NextResponse, type NextRequest } from "next/server";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const updateWorkshopSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().max(5000).optional(),
  attendeeCount: z.number().int().min(0).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, sessionId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }

  const workshop = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
  });

  if (!workshop) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: workshop });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, sessionId } = await params;
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

  const parsed = updateWorkshopSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const workshop = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: { id: true, status: true, facilitatorId: true, title: true },
  });

  if (!workshop) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  // Only facilitator or platform_admin can update
  if (workshop.facilitatorId !== user.id && user.role !== "platform_admin") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only the facilitator or platform admin can update the workshop" } },
      { status: 403 },
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.scheduledAt !== undefined) updateData.scheduledAt = new Date(parsed.data.scheduledAt);
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.attendeeCount !== undefined) updateData.attendeeCount = parsed.data.attendeeCount;

  const updated = await prisma.workshopSession.update({
    where: { id: workshop.id },
    data: updateData,
  });

  await logDecision({
    assessmentId,
    entityType: "workshop_session",
    entityId: sessionId,
    action: "PHASE_UPDATED",
    oldValue: { title: workshop.title, status: workshop.status },
    newValue: { title: updated.title, status: updated.status },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: updated });
}
