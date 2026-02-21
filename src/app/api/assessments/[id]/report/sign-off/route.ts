/** POST: Digital sign-off */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";


const bodySchema = z.object({
  signatoryName: z.string().min(1).max(255),
  signatoryEmail: z.string().email(),
  signatoryRole: z.enum(["client_representative", "bound_consultant", "bound_pm"]),
  acknowledgement: z.literal(true),
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

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  // Sign-off requires reviewed status
  if (assessment.status !== "reviewed" && assessment.status !== "completed") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Assessment must be in 'reviewed' or 'completed' status for sign-off" } },
      { status: 400 },
    );
  }

  const body: unknown = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 },
    );
  }

  // Check for duplicate sign-off
  const existing = await prisma.assessmentSignOff.findFirst({
    where: { assessmentId, signatoryRole: parsed.data.signatoryRole },
  });

  if (existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.CONFLICT, message: `This role (${parsed.data.signatoryRole}) has already signed off` } },
      { status: 409 },
    );
  }

  const signOff = await prisma.assessmentSignOff.create({
    data: {
      assessmentId,
      signatoryName: parsed.data.signatoryName,
      signatoryEmail: parsed.data.signatoryEmail,
      signatoryRole: parsed.data.signatoryRole,
      signedAt: new Date(),
    },
  });

  await logDecision({
    assessmentId,
    entityType: "assessment",
    entityId: assessmentId,
    action: "SIGNED_OFF",
    newValue: {
      signatoryName: parsed.data.signatoryName,
      signatoryRole: parsed.data.signatoryRole,
    },
    actor: user.email,
    actorRole: user.role,
  });

  // Check if all three sign-offs are collected
  const allSignOffs = await prisma.assessmentSignOff.findMany({
    where: { assessmentId },
    select: { signatoryRole: true },
  });
  const roles = new Set(allSignOffs.map((s) => s.signatoryRole));
  const allSigned = roles.has("client_representative") && roles.has("bound_consultant") && roles.has("bound_pm");

  let assessmentStatus: string = assessment.status;
  if (allSigned) {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: "signed_off" },
    });
    assessmentStatus = "signed_off";
  }

  return NextResponse.json({
    success: true,
    signedAt: signOff.signedAt.toISOString(),
    signatoryName: signOff.signatoryName,
    signatoryEmail: signOff.signatoryEmail,
    signatoryRole: signOff.signatoryRole,
    assessmentStatus,
  });
}
