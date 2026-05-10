/**
 * Shared utility for verifying user access to an assessment.
 * Cross-org access is gated by the role-capability matrix (canViewAllAssessments),
 * NOT a hardcoded role list — keeping the matrix as the single source of truth
 * prevents drift between the gate and per-capability checks elsewhere.
 *
 * Fallback path: matching organizationId OR stakeholder membership.
 */

import { prisma } from "@/lib/db/prisma";
import { getCapabilities } from "@/lib/auth/role-permissions";

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
  assessmentOrganizationId?: string,
): Promise<boolean> {
  // Cross-org roles have access to all assessments — driven by the capability matrix
  if (getCapabilities(user.role).canViewAllAssessments) return true;

  // Check if the assessment belongs to the user's organization
  const organizationId = assessmentOrganizationId ?? (
    await prisma.assessment.findUnique({
      where: { id: assessmentId, deletedAt: null },
      select: { organizationId: true },
    })
  )?.organizationId;

  if (!organizationId) return false;

  if (user.organizationId && organizationId === user.organizationId) return true;

  // Check if user is an assessment stakeholder
  const stakeholder = await prisma.assessmentStakeholder.findFirst({
    where: { assessmentId, userId: user.id },
    select: { id: true },
  });

  return !!stakeholder;
}
