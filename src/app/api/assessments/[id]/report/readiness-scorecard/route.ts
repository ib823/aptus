/** GET: Calculate readiness scorecard for an assessment */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, hasRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { calculateReadinessScorecard } from "@/lib/report/readiness-calculator";
import type { UserRole } from "@/types/assessment";

export const preferredRegion = "sin1";

const ALLOWED_ROLES: UserRole[] = [
  "consultant",
  "project_manager",
  "partner_lead",
  "platform_admin",
  "executive_sponsor",
];

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

  if (!hasRole(user, ALLOWED_ROLES)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const { id } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const [
    totalScopeItems,
    decidedScopeItems,
    totalSteps,
    reviewedSteps,
    totalGaps,
    resolvedGaps,
    totalIntegrations,
    analyzedIntegrations,
    totalDmObjects,
    readyDmObjects,
    totalOcmImpacts,
    mitigatedOcmImpacts,
    totalStakeholders,
    activeStakeholders,
    totalSignOffs,
    completedSignOffs,
  ] = await Promise.all([
    prisma.scopeSelection.count({ where: { assessmentId: id } }),
    prisma.scopeSelection.count({ where: { assessmentId: id, relevance: { not: "MAYBE" } } }),
    prisma.stepResponse.count({ where: { assessmentId: id } }),
    prisma.stepResponse.count({ where: { assessmentId: id, fitStatus: { not: "PENDING" } } }),
    prisma.gapResolution.count({ where: { assessmentId: id } }),
    prisma.gapResolution.count({ where: { assessmentId: id, clientApproved: true } }),
    prisma.integrationPoint.count({ where: { assessmentId: id } }),
    prisma.integrationPoint.count({ where: { assessmentId: id, status: "approved" } }),
    prisma.dataMigrationObject.count({ where: { assessmentId: id } }),
    prisma.dataMigrationObject.count({ where: { assessmentId: id, status: "approved" } }),
    prisma.ocmImpact.count({ where: { assessmentId: id } }),
    prisma.ocmImpact.count({ where: { assessmentId: id, status: "approved" } }),
    prisma.assessmentStakeholder.count({ where: { assessmentId: id } }),
    prisma.assessmentStakeholder.count({ where: { assessmentId: id, acceptedAt: { not: null } } }),
    prisma.assessmentSignOff.count({ where: { assessmentId: id } }),
    prisma.assessmentSignOff.count({ where: { assessmentId: id } }),
  ]);

  const scorecard = calculateReadinessScorecard({
    totalScopeItems,
    decidedScopeItems,
    totalSteps,
    reviewedSteps,
    totalGaps,
    resolvedGaps,
    totalIntegrations,
    analyzedIntegrations,
    totalDmObjects,
    readyDmObjects,
    totalOcmImpacts,
    mitigatedOcmImpacts,
    totalStakeholders,
    activeStakeholders,
    totalSignOffs,
    completedSignOffs,
  });

  return NextResponse.json({ data: scorecard });
}
