/** POST: Approve or revoke approval for a gap resolution */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const approvalSchema = z.object({
  approved: z.boolean(),
  note: z.string().max(5000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; gapId: string }> },
): Promise<NextResponse> {
  const { id: assessmentId, gapId } = await params;
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

  const parsed = approvalSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Verify gap exists and belongs to this assessment
  const existing = await prisma.gapResolution.findFirst({
    where: { id: gapId, assessmentId },
    select: {
      assessmentId: true,
      resolutionType: true,
      clientApproved: true,
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Gap resolution not found" } },
      { status: 404 },
    );
  }

  // Cannot approve a PENDING gap
  if (existing.resolutionType === "PENDING" && parsed.data.approved) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Cannot approve a gap with no resolution set" } },
      { status: 400 },
    );
  }

  if (parsed.data.approved) {
    const updated = await prisma.gapResolution.update({
      where: { id: gapId },
      data: {
        clientApproved: true,
        clientApprovedBy: user.email,
        clientApprovedAt: new Date(),
        clientApprovalNote: parsed.data.note ?? null,
      },
    });

    await logDecision({
      assessmentId,
      entityType: "gap_resolution",
      entityId: gapId,
      action: "GAP_APPROVAL_ADDED",
      oldValue: { clientApproved: false },
      newValue: { clientApproved: true, clientApprovedBy: user.email },
      actor: user.email,
      actorRole: user.role,
      reason: parsed.data.note,
    });

    return NextResponse.json({ data: updated });
  } else {
    // Revoke approval
    const updated = await prisma.gapResolution.update({
      where: { id: gapId },
      data: {
        clientApproved: false,
        clientApprovedBy: null,
        clientApprovedAt: null,
        clientApprovalNote: null,
      },
    });

    await logDecision({
      assessmentId,
      entityType: "gap_resolution",
      entityId: gapId,
      action: "GAP_APPROVAL_REVOKED",
      oldValue: { clientApproved: true },
      newValue: { clientApproved: false },
      actor: user.email,
      actorRole: user.role,
      reason: parsed.data.note,
    });

    return NextResponse.json({ data: updated });
  }
}
