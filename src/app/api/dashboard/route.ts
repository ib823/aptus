/** GET: Per-company progress dashboard data */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

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

  // Get assessments the user has access to
  const whereClause = user.organizationId
    ? { organizationId: user.organizationId, deletedAt: null }
    : { deletedAt: null };

  const assessments = await prisma.assessment.findMany({
    where: whereClause,
    select: {
      id: true,
      companyName: true,
      status: true,
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

  // Get recent activity for the user's assessments
  const assessmentIds = assessments.map((a) => a.id);

  const recentActivity = assessmentIds.length > 0
    ? await prisma.decisionLogEntry.findMany({
        where: { assessmentId: { in: assessmentIds } },
        orderBy: { timestamp: "desc" },
        take: 20,
        select: {
          id: true,
          assessmentId: true,
          entityType: true,
          action: true,
          actor: true,
          actorRole: true,
          timestamp: true,
        },
      })
    : [];

  // Get team progress per stakeholder
  const stakeholderProgress = assessmentIds.length > 0
    ? await prisma.assessmentStakeholder.findMany({
        where: { assessmentId: { in: assessmentIds } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          assignedAreas: true,
          lastActiveAt: true,
          assessmentId: true,
        },
      })
    : [];

  return NextResponse.json({
    data: {
      assessments,
      recentActivity,
      stakeholderProgress,
    },
  });
}
