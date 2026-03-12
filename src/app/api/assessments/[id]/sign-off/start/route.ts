/** POST: Initiate sign-off process */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";
import { randomBytes } from "crypto";

const startSchema = z.object({
  snapshotId: z.string().min(1, "Snapshot ID is required"),
});
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const allowedRoles = ["platform_admin", "partner_lead", "consultant"];
  if (!allowedRoles.includes(mapLegacyRole(user.role))) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to initiate sign-off" } },
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

  const parsed = startSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Check no existing sign-off process
  const existing = await prisma.signOffProcess.findUnique({
    where: { assessmentId: id },
  });
  if (existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.CONFLICT, message: "Sign-off process already exists for this assessment" } },
      { status: 409 },
    );
  }

  // Validate snapshot exists
  const snapshot = await prisma.assessmentSnapshot.findFirst({
    where: { id: parsed.data.snapshotId, assessmentId: id },
  });
  if (!snapshot) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Snapshot not found or does not belong to this assessment" } },
      { status: 404 },
    );
  }

  const verificationToken = randomBytes(32).toString("hex");

  const signOff = await prisma.signOffProcess.create({
    data: {
      assessmentId: id,
      snapshotId: parsed.data.snapshotId,
      status: "AREA_VALIDATION_IN_PROGRESS",
      initiatedById: user.id,
      verificationToken,
    },
  });

  await logDecision({
    assessmentId: id,
    entityType: "sign_off",
    entityId: signOff.id,
    action: "SIGNOFF_INITIATED",
    newValue: { snapshotId: parsed.data.snapshotId, status: "AREA_VALIDATION_IN_PROGRESS" },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: signOff }, { status: 201 });
}
