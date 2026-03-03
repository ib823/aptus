import type { Metadata } from "next";
import { ROLE_METADATA } from "@/lib/auth/role-metadata";
import { PERMISSION_MATRIX } from "@/lib/auth/permission-matrix";
import { ROLE_CAPABILITIES } from "@/lib/auth/role-permissions";
import { RolesPermissionsClient } from "@/components/admin/RolesPermissionsClient";
import type { UserRole } from "@/types/assessment";

export const metadata: Metadata = { title: "Roles & Permissions" };

export default function RolesPage() {
  // Pre-serialize Sets to arrays for the client component
  const serializedMatrix: Record<string, string[]> = {};
  for (const [role, perms] of Object.entries(PERMISSION_MATRIX)) {
    serializedMatrix[role] = Array.from(perms);
  }

  // Serialize role metadata into a plain array
  const roles = (Object.keys(ROLE_METADATA) as UserRole[]).map((role) => {
    const meta = ROLE_METADATA[role];
    const caps = ROLE_CAPABILITIES[role];
    return {
      id: meta.id,
      label: meta.label,
      description: meta.description,
      category: meta.category,
      hierarchyLevel: meta.hierarchyLevel,
      validOrgTypes: meta.validOrgTypes,
      mfaDefault: meta.mfaDefault,
      canCreateAssessments: meta.canCreateAssessments,
      canManageUsers: meta.canManageUsers,
      keyCapabilities: {
        canCreateAssessment: caps.canCreateAssessment,
        canEditAssessment: caps.canEditAssessment,
        canManageOrganization: caps.canManageOrganization,
        canInviteUsers: caps.canInviteUsers,
        canSignOff: caps.canSignOff,
        isAreaLocked: caps.isAreaLocked,
      },
    };
  });

  return (
    <div className="max-w-7xl">
      <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">Roles &amp; Permissions</h1>
      <p className="text-base text-muted-foreground mb-8">
        View all {roles.length} platform roles and their permission assignments across {Object.keys(serializedMatrix.platform_admin ?? {}).length || Array.from(PERMISSION_MATRIX.platform_admin).length} actions
      </p>
      <RolesPermissionsClient
        roles={roles}
        permissionMatrix={serializedMatrix}
      />
    </div>
  );
}
