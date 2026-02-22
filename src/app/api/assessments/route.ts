/** GET: List assessments for current user's organization */
/** POST: Create a new assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { getCapabilities } from "@/lib/auth/role-permissions";
import { createAssessment, listAssessments } from "@/lib/db/assessments";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const createSchema = z.object({
  companyName: z.string().min(1).max(200),
  industry: z.string().min(1),
  country: z.string().min(2).max(10),
  operatingCountries: z.array(z.string()).default([]),
  companySize: z.enum(["small", "midsize", "large", "enterprise"]),
  revenueBand: z.string().optional(),
  currentErp: z.string().optional(),
});

export const preferredRegion = "sin1";

export async function GET(): Promise<NextResponse> {
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

  // Platform admins, partner leads, and consultants without org see all assessments
  const role = mapLegacyRole(user.role);
  const caps = getCapabilities(role);
  if (!user.organizationId && (caps.canViewAllAssessments || role === "consultant")) {
    const assessments = await prisma.assessment.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        companyName: true,
        industry: true,
        country: true,
        companySize: true,
        status: true,
        createdBy: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            scopeSelections: { where: { selected: true } },
            stepResponses: true,
            gapResolutions: true,
            stakeholders: true,
          },
        },
      },
    });
    return NextResponse.json({ data: assessments });
  }

  if (!user.organizationId) {
    return NextResponse.json({ data: [] });
  }

  const assessments = await listAssessments(user.organizationId);
  return NextResponse.json({ data: assessments });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const createRole = mapLegacyRole(user.role);
  const createCaps = getCapabilities(createRole);
  if (!createCaps.canCreateAssessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Your role does not have permission to create assessments" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = createSchema.safeParse(body);
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

  try {
    // Ensure organization exists or create one
    let organizationId = user.organizationId;
    if (!organizationId) {
      const org = await prisma.organization.create({
        data: {
          name: parsed.data.companyName,
          type: "client",
        },
      });
      organizationId = org.id;

      // Link user to org
      await prisma.user.update({
        where: { id: user.id },
        data: { organizationId },
      });
    }

    const assessment = await createAssessment({
      ...parsed.data,
      createdBy: user.id,
      organizationId,
    });

    // Add the creating user as a consultant stakeholder
    await prisma.assessmentStakeholder.create({
      data: {
        assessmentId: assessment.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedAreas: [],
        canEdit: true,
        invitedBy: user.id,
      },
    });

    return NextResponse.json({ data: assessment }, { status: 201 });
  } catch (err) {
    console.error("[API] Failed to create assessment:", err);
    return NextResponse.json(
      { error: { code: ERROR_CODES.INTERNAL_ERROR, message: "Failed to create assessment. Please try again." } },
      { status: 500 },
    );
  }
}
