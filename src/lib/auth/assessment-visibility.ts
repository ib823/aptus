import { Prisma } from "@prisma/client";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import type { UserRole } from "@/types/assessment";

interface MinimalUser {
  id: string;
  role: UserRole | string;
  organizationId: string | null;
}

export function canViewAllAssessments(user: MinimalUser): boolean {
  return mapLegacyRole(user.role) === "platform_admin";
}

export function getVisibleAssessmentWhere(user: MinimalUser): Prisma.AssessmentWhereInput {
  if (canViewAllAssessments(user)) {
    return { deletedAt: null };
  }

  if (user.organizationId) {
    return { organizationId: user.organizationId, deletedAt: null };
  }

  return {
    deletedAt: null,
    stakeholders: { some: { userId: user.id } },
  };
}

export function getVisibleAssessmentSql(user: MinimalUser): Prisma.Sql {
  if (canViewAllAssessments(user)) {
    return Prisma.empty;
  }

  if (user.organizationId) {
    return Prisma.sql`AND a."organizationId" = ${user.organizationId}`;
  }

  return Prisma.sql`
    AND EXISTS (
      SELECT 1
      FROM "AssessmentStakeholder" s
      WHERE s."assessmentId" = a.id
        AND s."userId" = ${user.id}
    )
  `;
}
