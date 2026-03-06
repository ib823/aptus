/**
 * Shared utility for verifying user access to an assessment.
 * Checks: platform_admin OR matching organizationId OR AssessmentStakeholder membership.
 */

import { prisma } from "@/lib/db/prisma";

interface MinimalUser {
  id: string;
  role: string;
  organizationId: string | null;
}

/**
 * Verifies that the given user has access to the specified assessment.
 * Returns true if access is granted, false otherwise.
 */
export async function verifyAssessmentAccess(
  user: MinimalUser,
  assessmentId: string,
): Promise<boolean> {
  // Platform admins have access to all assessments
  if (user.role === "platform_admin") return true;

  // Check if the assessment belongs to the user's organization
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { organizationId: true },
  });

  if (!assessment) return false;

  if (assessment.organizationId === user.organizationId) return true;

  // Check if user is an assessment stakeholder
  const stakeholder = await prisma.assessmentStakeholder.findFirst({
    where: { assessmentId, userId: user.id },
    select: { id: true },
  });

  return !!stakeholder;
}
