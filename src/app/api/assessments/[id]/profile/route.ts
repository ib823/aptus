/** GET: Get assessment profile with completeness score */
/** PUT: Update assessment profile fields */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export const preferredRegion = "sin1";
export const maxDuration = 30;

const profileSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  industry: z.string().min(1).max(100).optional(),
  country: z.string().min(1).max(10).optional(),
  operatingCountries: z.array(z.string()).optional(),
  companySize: z.enum(["small", "midsize", "large", "enterprise"]).optional(),
  revenueBand: z.string().max(50).nullable().optional(),
  employeeCount: z.number().int().min(0).nullable().optional(),
  annualRevenue: z.number().min(0).nullable().optional(),
  currencyCode: z.string().min(3).max(3).nullable().optional(),
  targetGoLiveDate: z.string().datetime().nullable().optional(),
  deploymentModel: z.enum(["public_cloud", "private_cloud", "hybrid"]).nullable().optional(),
  sapModules: z.array(z.string()).optional(),
  keyProcesses: z.array(z.string()).optional(),
  languageRequirements: z.array(z.string()).optional(),
  regulatoryFrameworks: z.array(z.string()).optional(),
  itLandscapeSummary: z.string().max(10000).nullable().optional(),
  currentErpVersion: z.string().max(100).nullable().optional(),
  migrationApproach: z.enum(["greenfield", "brownfield", "selective"]).nullable().optional(),
});

const PROFILE_SELECT = {
  id: true,
  companyName: true,
  industry: true,
  country: true,
  operatingCountries: true,
  companySize: true,
  revenueBand: true,
  employeeCount: true,
  annualRevenue: true,
  currencyCode: true,
  targetGoLiveDate: true,
  deploymentModel: true,
  sapModules: true,
  keyProcesses: true,
  languageRequirements: true,
  regulatoryFrameworks: true,
  itLandscapeSummary: true,
  currentErpVersion: true,
  migrationApproach: true,
  profileCompletedAt: true,
  profileCompletedBy: true,
} as const;

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
  const assessment = await prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    select: PROFILE_SELECT,
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const { score, breakdown } = calculateProfileCompleteness(assessment);

  return NextResponse.json({
    data: {
      ...assessment,
      completenessScore: score,
      completenessBreakdown: breakdown,
    },
  });
}

export async function PUT(
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

  const { id } = await params;

  const body: unknown = await request.json();
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const existing = await prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  // Build update data — only include fields that were sent
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key === "targetGoLiveDate" && typeof value === "string") {
      updateData[key] = new Date(value);
    } else {
      updateData[key] = value;
    }
  }

  const updated = await prisma.assessment.update({
    where: { id },
    data: updateData,
    select: PROFILE_SELECT,
  });

  const { score, breakdown } = calculateProfileCompleteness(updated);

  // Auto-set profileCompletedAt when score reaches 100%
  if (score >= 100 && !updated.profileCompletedAt) {
    await prisma.assessment.update({
      where: { id },
      data: {
        profileCompletedAt: new Date(),
        profileCompletedBy: user.email,
      },
    });
  }

  await logDecision({
    assessmentId: id,
    entityType: "assessment_profile",
    entityId: id,
    action: "PROFILE_UPDATED",
    newValue: { ...parsed.data, completenessScore: score },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({
    data: {
      ...updated,
      completenessScore: score,
      completenessBreakdown: breakdown,
    },
  });
}
