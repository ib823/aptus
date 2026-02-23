/** POST: Approve or revoke approval for a gap resolution */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
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

  const { id: assessmentId, gapId } = await params;

  const body: unknown = await request.json();
  const parsed = approvalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Verify gap exists and belongs to this assessment
  const existing = await prisma.gapResolution.findUnique({
    where: { id: gapId },
    select: {
      assessmentId: true,
      resolutionType: true,
      clientApproved: true,
    },
  });

  if (!existing || existing.assessmentId !== assessmentId) {
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
