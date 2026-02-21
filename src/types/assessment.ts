/** Assessment data types */

export type AssessmentStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "reviewed"
  | "signed_off";

export type UserRole =
  | "process_owner"
  | "it_lead"
  | "executive"
  | "consultant"
  | "admin";

export type FitStatus = "FIT" | "CONFIGURE" | "GAP" | "NA" | "PENDING";

export type Relevance = "YES" | "NO" | "MAYBE";

export type CurrentState = "MANUAL" | "SYSTEM" | "OUTSOURCED" | "NA";

export type CompanySize = "small" | "midsize" | "large" | "enterprise";

export type ResolutionType =
  | "FIT"
  | "CONFIGURE"
  | "KEY_USER_EXT"
  | "BTP_EXT"
  | "ISV"
  | "CUSTOM_ABAP"
  | "ADAPT_PROCESS"
  | "OUT_OF_SCOPE";

export type MfaMethod = "none" | "totp" | "webauthn";

// Phase 10: Company Profile
export type DeploymentModel = "public_cloud" | "private_cloud" | "hybrid";
export type MigrationApproach = "greenfield" | "brownfield" | "selective";

export interface ProfileCompletenessBreakdown {
  basic: boolean;
  financial: boolean;
  sapStrategy: boolean;
  operational: boolean;
  itLandscape: boolean;
}

export const PROFILE_COMPLETENESS_GATE = 60;

// Phase 12: Step Classification
export type StepCategory =
  | "BUSINESS_PROCESS"
  | "CONFIGURATION"
  | "REPORTING"
  | "MASTER_DATA"
  | "REFERENCE"
  | "SYSTEM_ACCESS"
  | "TEST_INFO";

// Phase 13: Gap Resolution V2
export type GapPriority = "critical" | "high" | "medium" | "low";
export type RiskCategory = "technical" | "business" | "compliance" | "integration";
export type UpgradeStrategy = "standard_upgrade" | "needs_revalidation" | "custom_maintenance";

export interface CostRollup {
  totalOneTimeCost: number;
  totalRecurringCost: number;
  totalImplementationDays: number;
  byResolutionType: Record<string, { oneTime: number; recurring: number; days: number }>;
  byRiskCategory: Record<string, { oneTime: number; recurring: number; count: number }>;
  byPriority: Record<string, { oneTime: number; recurring: number; count: number }>;
}

export type DecisionAction =
  | "MARKED_FIT"
  | "MARKED_GAP"
  | "RESOLUTION_SELECTED"
  | "RESOLUTION_CHANGED"
  | "SCOPE_INCLUDED"
  | "SCOPE_EXCLUDED"
  | "NOTE_ADDED"
  | "APPROVED"
  | "SIGNED_OFF"
  | "STAKEHOLDER_ADDED"
  | "STAKEHOLDER_REMOVED"
  | "MFA_ENROLLED"
  | "SESSION_REVOKED"
  | "PERMISSION_OVERRIDE"
  | "REMAINING_ITEM_ADDED"
  | "FLOW_DIAGRAM_GENERATED"
  | "CONFIG_INCLUDED"
  | "CONFIG_EXCLUDED"
  | "GAP_APPROVAL_ADDED"
  | "GAP_ALTERNATIVE_ADDED"
  | "PROFILE_UPDATED";

export interface AssessmentSummary {
  id: string;
  companyName: string;
  industry: string;
  country: string;
  companySize: string;
  status: AssessmentStatus;
  createdBy: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StakeholderInfo {
  id: string;
  assessmentId: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  assignedAreas: string[];
  canEdit: boolean;
  lastActiveAt: string | null;
  invitedAt: string;
  acceptedAt: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string | null;
  mfaEnabled: boolean;
  mfaVerified: boolean;
  totpVerified: boolean;
}

/** Status transition rules */
export const VALID_STATUS_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  draft: ["in_progress"],
  in_progress: ["completed"],
  completed: ["reviewed"],
  reviewed: ["signed_off"],
  signed_off: [],
};

/** Role-based transition permissions */
export const STATUS_TRANSITION_ROLES: Record<string, UserRole[]> = {
  "draft->in_progress": ["consultant", "admin"],
  "in_progress->completed": ["consultant", "admin"],
  "completed->reviewed": ["consultant", "admin"],
  "reviewed->signed_off": ["consultant", "admin", "executive"],
};
