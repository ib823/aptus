/** Phase 17: Role metadata — detailed info about each of the 11 platform roles */

import type { UserRole } from "@/types/assessment";
import { mapLegacyRole } from "@/lib/auth/role-migration";

export interface RoleMetadata {
  id: UserRole;
  label: string;
  description: string;
  category: "platform" | "partner" | "assessment" | "client";
  hierarchyLevel: number;
  validOrgTypes: Array<"PLATFORM" | "PARTNER" | "DIRECT_CLIENT">;
  mfaDefault: "required" | "optional" | "disabled";
  maxConcurrentSessions: number;
  canCreateAssessments: boolean;
  canManageUsers: boolean;
}

export const ROLE_METADATA: Record<UserRole, RoleMetadata> = {
  platform_admin: {
    id: "platform_admin",
    label: "Platform Admin",
    description: "Aptus platform operator with full system access",
    category: "platform",
    hierarchyLevel: 1,
    validOrgTypes: ["PLATFORM"],
    mfaDefault: "required",
    maxConcurrentSessions: 3,
    canCreateAssessments: true,
    canManageUsers: true,
  },
  partner_lead: {
    id: "partner_lead",
    label: "Partner Lead",
    description: "Consulting firm leader managing partner organization",
    category: "partner",
    hierarchyLevel: 2,
    validOrgTypes: ["PARTNER"],
    mfaDefault: "required",
    maxConcurrentSessions: 3,
    canCreateAssessments: true,
    canManageUsers: true,
  },
  consultant: {
    id: "consultant",
    label: "Consultant",
    description: "SAP consultant running assessments",
    category: "assessment",
    hierarchyLevel: 3,
    validOrgTypes: ["PARTNER"],
    mfaDefault: "required",
    maxConcurrentSessions: 2,
    canCreateAssessments: true,
    canManageUsers: false,
  },
  project_manager: {
    id: "project_manager",
    label: "Project Manager",
    description: "Project management with read-all access and stakeholder management",
    category: "assessment",
    hierarchyLevel: 4,
    validOrgTypes: ["PARTNER", "DIRECT_CLIENT"],
    mfaDefault: "optional",
    maxConcurrentSessions: 2,
    canCreateAssessments: false,
    canManageUsers: false,
  },
  solution_architect: {
    id: "solution_architect",
    label: "Solution Architect",
    description: "Cross-area technical oversight with read-all access",
    category: "assessment",
    hierarchyLevel: 4,
    validOrgTypes: ["PARTNER"],
    mfaDefault: "optional",
    maxConcurrentSessions: 2,
    canCreateAssessments: false,
    canManageUsers: false,
  },
  process_owner: {
    id: "process_owner",
    label: "Process Owner",
    description: "Area-locked access for classifying steps within assigned functional areas",
    category: "client",
    hierarchyLevel: 6,
    validOrgTypes: ["DIRECT_CLIENT"],
    mfaDefault: "optional",
    maxConcurrentSessions: 1,
    canCreateAssessments: false,
    canManageUsers: false,
  },
  it_lead: {
    id: "it_lead",
    label: "IT Lead",
    description: "Technical notes, integration and DM register access",
    category: "client",
    hierarchyLevel: 5,
    validOrgTypes: ["DIRECT_CLIENT"],
    mfaDefault: "optional",
    maxConcurrentSessions: 2,
    canCreateAssessments: false,
    canManageUsers: false,
  },
  data_migration_lead: {
    id: "data_migration_lead",
    label: "Data Migration Lead",
    description: "Full DM register access, read-only elsewhere",
    category: "client",
    hierarchyLevel: 6,
    validOrgTypes: ["DIRECT_CLIENT", "PARTNER"],
    mfaDefault: "optional",
    maxConcurrentSessions: 1,
    canCreateAssessments: false,
    canManageUsers: false,
  },
  executive_sponsor: {
    id: "executive_sponsor",
    label: "Executive Sponsor",
    description: "Read-only access with sign-off authority and dashboard view",
    category: "client",
    hierarchyLevel: 7,
    validOrgTypes: ["DIRECT_CLIENT"],
    mfaDefault: "optional",
    maxConcurrentSessions: 1,
    canCreateAssessments: false,
    canManageUsers: false,
  },
  viewer: {
    id: "viewer",
    label: "Viewer",
    description: "Read-only access for auditors and steering committee",
    category: "client",
    hierarchyLevel: 10,
    validOrgTypes: ["DIRECT_CLIENT", "PARTNER"],
    mfaDefault: "disabled",
    maxConcurrentSessions: 1,
    canCreateAssessments: false,
    canManageUsers: false,
  },
  client_admin: {
    id: "client_admin",
    label: "Client Admin",
    description: "Client-side user management within client organization",
    category: "client",
    hierarchyLevel: 3,
    validOrgTypes: ["DIRECT_CLIENT"],
    mfaDefault: "required",
    maxConcurrentSessions: 2,
    canCreateAssessments: false,
    canManageUsers: true,
  },
  support: {
    id: "support",
    label: "Support",
    description: "CoreEdge operations — monitors live integrations, holds no governance mutation",
    category: "platform",
    hierarchyLevel: 8,
    validOrgTypes: ["PLATFORM", "PARTNER"],
    // Reaches live customer-integration telemetry, so it is treated like the
    // other platform roles rather than like a read-only viewer.
    mfaDefault: "required",
    maxConcurrentSessions: 2,
    canCreateAssessments: false,
    canManageUsers: false,
  },
};

/**
 * Get role metadata, supporting legacy role names.
 */
export function getRoleMetadata(role: string): RoleMetadata {
  const normalized = mapLegacyRole(role);
  return ROLE_METADATA[normalized] ?? ROLE_METADATA.viewer;
}

/**
 * Get all roles valid for a given organization type.
 */
export function getRolesForOrgType(
  orgType: "PLATFORM" | "PARTNER" | "DIRECT_CLIENT",
): UserRole[] {
  return (Object.entries(ROLE_METADATA) as Array<[UserRole, RoleMetadata]>)
    .filter(([, meta]) => meta.validOrgTypes.includes(orgType))
    .map(([role]) => role);
}

/**
 * Check if a role is valid for a given organization type.
 */
export function isRoleValidForOrgType(
  role: string,
  orgType: "PLATFORM" | "PARTNER" | "DIRECT_CLIENT",
): boolean {
  const normalized = mapLegacyRole(role);
  const meta = ROLE_METADATA[normalized];
  return meta ? meta.validOrgTypes.includes(orgType) : false;
}
