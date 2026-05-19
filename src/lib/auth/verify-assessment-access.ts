/**
 * Shared utility for verifying user access to an assessment.
 * Platform admins have global assessment access. Other users need either
 * same-organization membership or explicit stakeholder membership.
 *
 * Fallback path: matching organizationId OR stakeholder membership.
 */

import { prisma } from "@/lib/db/prisma";
import { mapLegacyRole } from "@/lib/auth/role-migration";

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
  if (mapLegacyRole(user.role) === "platform_admin") return true;

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
