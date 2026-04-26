/** POST: Digital sign-off action.
 *  GET:  Sign-off PDF (spec §4.16) — 2-page acceptance with two-up signature
 *        blocks and bundle SHA-256 hash. */

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { authenticateForReport, isErrorResponse, sanitizeFilename } from "@/lib/report/report-auth";
import { generateSignOffPdf } from "@/lib/report/pdf-generator";
import { loadAssessmentBranding } from "@/lib/report/branding";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const auth = await authenticateForReport(assessmentId);
  if (isErrorResponse(auth)) return auth;

  const [assessment, branding] = await Promise.all([
    prisma.assessment.findUniqueOrThrow({
      where: { id: assessmentId },
      select: {
        companyName: true,
        industry: true,
        country: true,
        companySize: true,
        updatedAt: true,
      },
    }),
    loadAssessmentBranding(assessmentId),
  ]);

  // Standalone-route hash: identifies this assessment + its current state.
  // The complete-package route uses the actual ZIP hash (computed after assembly).
  const standaloneHash = createHash("sha256")
    .update(assessmentId + assessment.updatedAt.toISOString())
    .digest("hex");

  const pdf = generateSignOffPdf(
    { assessment, bundleHash: standaloneHash },
    branding,
  );

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(assessment.companyName)}_Sign_Off.pdf"`,
    },
  });
}

const bodySchema = z.object({
  signatoryName: z.string().min(1).max(255),
  signatoryEmail: z.string().email(),
  signatoryRole: z.enum(["client_representative", "abeam_consultant", "abeam_pm"]),
  acknowledgement: z.literal(true),
});
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: assessmentId } = await params;
  const access = await requireAssessmentAccess(assessmentId);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user, assessment } = access;

  // Sign-off requires reviewed status
  if (assessment.status !== "reviewed" && assessment.status !== "completed") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Assessment must be in 'reviewed' or 'completed' status for sign-off" } },
      { status: 400 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(bodyResult.data);
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
  const allSigned = roles.has("client_representative") && roles.has("abeam_consultant") && roles.has("abeam_pm");

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
