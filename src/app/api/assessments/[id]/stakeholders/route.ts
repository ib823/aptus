/** GET: List stakeholders for an assessment */
/** POST: Add a stakeholder */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { canManageStakeholders } from "@/lib/auth/permissions";
import { addStakeholder, getStakeholders } from "@/lib/db/assessments";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { sendEmail } from "@/lib/email/brevo";
import { stakeholderInviteEmail } from "@/lib/email/templates";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const addStakeholderSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.enum(["process_owner", "it_lead", "executive", "consultant"]),
  assignedAreas: z.array(z.string()).default([]),
});
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }

  const stakeholders = await getStakeholders(id);
  return NextResponse.json({ data: stakeholders });
}

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

  const permCheck = canManageStakeholders(user);
  if (!permCheck.allowed) {
    return NextResponse.json(
      { error: { code: permCheck.code ?? ERROR_CODES.FORBIDDEN, message: permCheck.message ?? "Forbidden" } },
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

  const parsed = addStakeholderSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Validation failed",
          details: parsed.error.flatten().fieldErrors as Record<string, string>,
        },
      },
      { status: 400 },
    );
  }

  // Find or create the user
  let stakeholderUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (!stakeholderUser) {
    stakeholderUser = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        organizationId: assessment.organizationId,
        invitedBy: user.id,
        invitedAt: new Date(),
      },
    });
  }

  // Check for duplicate stakeholder
  const existing = await prisma.assessmentStakeholder.findUnique({
    where: {
      assessmentId_email: {
        assessmentId,
        email: parsed.data.email,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Stakeholder already exists" } },
      { status: 409 },
    );
  }

  const stakeholder = await addStakeholder({
    assessmentId,
    userId: stakeholderUser.id,
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    assignedAreas: parsed.data.assignedAreas,
    invitedBy: user.id,
  });

  // Log the decision
  await logDecision({
    assessmentId,
    entityType: "stakeholder",
    entityId: stakeholder.id,
    action: "STAKEHOLDER_ADDED",
    newValue: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      assignedAreas: parsed.data.assignedAreas,
    },
    actor: user.email,
    actorRole: user.role,
  });

  // Send stakeholder invitation email (fire-and-forget)
  const assessmentForEmail = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { companyName: true },
  });
  const loginUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/login`;
  const emailContent = stakeholderInviteEmail({
    recipientName: parsed.data.name,
    inviterName: user.name ?? user.email,
    assessmentName: assessmentForEmail?.companyName ?? "an assessment",
    role: parsed.data.role,
    loginUrl,
  });
  sendEmail({
    to: { email: parsed.data.email, name: parsed.data.name },
    subject: emailContent.subject,
    htmlContent: emailContent.html,
    textContent: emailContent.text,
    tags: ["stakeholder-invite"],
  }).catch((err) => console.error("[EMAIL] Failed to send stakeholder invite:", err));

  return NextResponse.json({ data: stakeholder }, { status: 201 });
}
