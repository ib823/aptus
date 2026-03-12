/**
 * Shared utility for verifying user access to an assessment.
 * Checks: platform_admin OR partner_lead/consultant (cross-org) OR matching organizationId OR stakeholder.
 */

import { prisma } from "@/lib/db/prisma";
import { mapLegacyRole } from "@/lib/auth/role-migration";

interface MinimalUser {
  id: string;
  role: string;
  organizationId: string | null;
}

/** Roles that can view all assessments across organizations */
const CROSS_ORG_ROLES = ["platform_admin", "partner_lead", "consultant"];

/**
 * Verifies that the given user has access to the specified assessment.
 * Returns true if access is granted, false otherwise.
 */
export async function verifyAssessmentAccess(
  user: MinimalUser,
  assessmentId: string,
): Promise<boolean> {
  const role = mapLegacyRole(user.role);

  // Cross-org roles have access to all assessments
  if (CROSS_ORG_ROLES.includes(role)) return true;

  // Check if the assessment belongs to the user's organization
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { organizationId: true },
  });

  if (!assessment) return false;

  if (user.organizationId && assessment.organizationId === user.organizationId) return true;

  // Check if user is an assessment stakeholder
  const stakeholder = await prisma.assessmentStakeholder.findFirst({
    where: { assessmentId, userId: user.id },
    select: { id: true },
  });

  return !!stakeholder;
}
