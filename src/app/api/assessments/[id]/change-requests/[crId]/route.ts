/** GET: Get change request details */
/** PUT: Approve or reject change request */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const updateChangeRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  rejectedReason: z.string().optional(),
});
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; crId: string }> },
): Promise<NextResponse> {
  const { id, crId } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }

  const changeRequest = await prisma.changeRequest.findFirst({
    where: { id: crId, assessmentId: id },
  });

  if (!changeRequest) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Change request not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: changeRequest });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; crId: string }> },
): Promise<NextResponse> {
  const { id, crId } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const allowedRoles = ["platform_admin", "partner_lead", "consultant"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to approve/reject change requests" } },
      { status: 403 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = updateChangeRequestSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const changeRequest = await prisma.changeRequest.findFirst({
    where: { id: crId, assessmentId: id },
  });

  if (!changeRequest) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Change request not found" } },
      { status: 404 },
    );
  }

  if (changeRequest.status !== "REQUESTED") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Change request is not in REQUESTED status" } },
      { status: 400 },
    );
  }

  // Four-eyes principle: approver must be different from requester
  if (changeRequest.requestedById === user.id) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "You cannot approve your own change request. A different authorized user must approve." } },
      { status: 403 },
    );
  }

  const updated = await prisma.changeRequest.update({
    where: { id: crId },
    data: {
      status: parsed.data.status,
      approvedById: parsed.data.status === "APPROVED" ? user.id : null,
      approvedAt: parsed.data.status === "APPROVED" ? new Date() : null,
      rejectedReason: parsed.data.rejectedReason ?? null,
    },
  });

  await logDecision({
    assessmentId: id,
    entityType: "change_request",
    entityId: crId,
    action: "CHANGE_REQUEST_APPROVED",
    oldValue: { status: "REQUESTED" },
    newValue: { status: parsed.data.status },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: updated });
}
