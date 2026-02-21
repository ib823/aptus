/** POST: Initiate sign-off process */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
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
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to initiate sign-off" } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = startSchema.safeParse(body);
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
  const snapshot = await prisma.assessmentSnapshot.findUnique({
    where: { id: parsed.data.snapshotId },
  });
  if (!snapshot || snapshot.assessmentId !== id) {
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
