/** GET: Get assessment details */
/** PATCH: Update assessment (status transitions) */
/** DELETE: Soft-delete assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, canTransitionStatus } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { getAssessment, updateAssessmentStatus, softDeleteAssessment } from "@/lib/db/assessments";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { AssessmentStatus } from "@/types/assessment";
import { z } from "zod";

export const preferredRegion = "sin1";

const updateSchema = z.object({
  status: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
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

  const { id } = await params;
  const assessment = await getAssessment(id);
  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: assessment });
}

export async function PATCH(
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

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const assessment = await getAssessment(id);
  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  if (parsed.data.status) {
    const permCheck = await canTransitionStatus(user, assessment.status, parsed.data.status, id);
    if (!permCheck.allowed) {
      return NextResponse.json(
        { error: { code: permCheck.code ?? ERROR_CODES.FORBIDDEN, message: permCheck.message ?? "Forbidden" } },
        { status: 403 },
      );
    }

    const oldStatus = assessment.status;
    const updated = await updateAssessmentStatus(id, parsed.data.status as AssessmentStatus);

    // Log to StatusTransitionLog (Phase 18)
    await prisma.statusTransitionLog.create({
      data: {
        assessmentId: id,
        fromStatus: oldStatus,
        toStatus: parsed.data.status,
        triggeredBy: user.id,
        triggeredByRole: user.role,
      },
    });

    await logDecision({
      assessmentId: id,
      entityType: "assessment",
      entityId: id,
      action: "STATUS_TRANSITIONED",
      oldValue: { status: oldStatus },
      newValue: { status: parsed.data.status },
      actor: user.email,
      actorRole: user.role,
    });

    return NextResponse.json({ data: updated });
  }

  return NextResponse.json({ data: assessment });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const role = mapLegacyRole(user.role);
  if (role !== "platform_admin" && role !== "consultant" && role !== "partner_lead") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only admins, partner leads, and consultants can delete assessments" } },
      { status: 403 },
    );
  }

  const { id } = await params;
  await softDeleteAssessment(id);

  return NextResponse.json({ data: { deleted: true } });
}
