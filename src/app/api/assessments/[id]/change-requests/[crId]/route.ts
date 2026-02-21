/** GET: Get change request details */
/** PUT: Approve or reject change request */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";


const updateChangeRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  rejectedReason: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; crId: string }> },
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

  const { crId } = await params;
  const changeRequest = await prisma.changeRequest.findUnique({
    where: { id: crId },
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

  const allowedRoles = ["platform_admin", "partner_lead", "consultant"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to approve/reject change requests" } },
      { status: 403 },
    );
  }

  const { id, crId } = await params;
  const body: unknown = await request.json();
  const parsed = updateChangeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const changeRequest = await prisma.changeRequest.findUnique({
    where: { id: crId },
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
