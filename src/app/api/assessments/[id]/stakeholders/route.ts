/** GET: List stakeholders for an assessment */
/** POST: Add a stakeholder */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, canManageStakeholders } from "@/lib/auth/permissions";
import { addStakeholder, getStakeholders } from "@/lib/db/assessments";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export const preferredRegion = "sin1";

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
  const stakeholders = await getStakeholders(id);
  return NextResponse.json({ data: stakeholders });
}

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

  const permCheck = canManageStakeholders(user);
  if (!permCheck.allowed) {
    return NextResponse.json(
      { error: { code: permCheck.code ?? ERROR_CODES.FORBIDDEN, message: permCheck.message ?? "Forbidden" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;
  const body: unknown = await request.json();
  const parsed = addStakeholderSchema.safeParse(body);
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
    // Get the assessment's organization
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { organizationId: true },
    });

    stakeholderUser = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        organizationId: assessment?.organizationId ?? null,
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

  // In dev, log the magic link that would be sent
  if (process.env.NODE_ENV === "development") {
    console.log(`[MAGIC LINK] Would send invitation to ${parsed.data.email} for assessment ${assessmentId}`);
  }

  return NextResponse.json({ data: stakeholder }, { status: 201 });
}
