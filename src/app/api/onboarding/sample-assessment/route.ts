/** POST: Create a sample assessment with demo data for onboarding */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { UserRole } from "@/types/assessment";

const ALLOWED_ROLES: UserRole[] = ["consultant", "partner_lead", "platform_admin"];

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only consultants, partner leads, and platform admins can create sample assessments" } },
      { status: 403 },
    );
  }

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "User must belong to an organization" } },
      { status: 400 },
    );
  }

  // Check if user already has a sample assessment
  const existing = await prisma.assessment.findFirst({
    where: {
      createdBy: user.id,
      companyName: "Sample: Acme Corp",
      deletedAt: null,
    },
    select: { id: true, companyName: true },
  });

  if (existing) {
    return NextResponse.json(
      { data: { assessmentId: existing.id, assessmentName: existing.companyName } },
      { status: 200 },
    );
  }

  // Create sample assessment with demo data
  const assessment = await prisma.assessment.create({
    data: {
      companyName: "Sample: Acme Corp",
      industry: "Manufacturing",
      country: "US",
      companySize: "1000-5000",
      status: "scoping",
      createdBy: user.id,
      organizationId: user.organizationId,
    },
  });

  // Store sample assessment ID in onboarding metadata
  await prisma.onboardingProgress.updateMany({
    where: { userId: user.id },
    data: {
      metadata: { sampleAssessmentId: assessment.id },
    },
  });

  return NextResponse.json(
    { data: { assessmentId: assessment.id, assessmentName: assessment.companyName } },
    { status: 201 },
  );
}
